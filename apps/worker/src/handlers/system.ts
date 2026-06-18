import { Job } from 'bullmq';
import { JobData, SystemConfig } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { 
  getOrgById, 
  getOrgByPhoneId,
  logSystemEvent, 
  getActiveOrganizations,
  releaseExpiredReservations
} from '@naija-agent/firebase';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

export async function handleInventoryCleanup(
  job: Job<JobData>
): Promise<{ success: boolean }> {
  logger.info(`📦 [INVENTORY CLEANUP] Starting global stock release scan...`);
  const orgs = await getActiveOrganizations();
  let totalReleased = 0;

  for (const org of orgs) {
    try {
      const released = await releaseExpiredReservations(org.id);
      if (released > 0) {
        totalReleased += released;
        logger.info({ orgId: org.id, released }, `✅ [INVENTORY] Released expired locks`);
        await logSystemEvent(org.id, 'INVENTORY_CLEANUP', `Released ${released} expired stock reservations.`);
      }
    } catch (e: any) {
      logger.error({ orgId: org.id, error: e.message }, `❌ [INVENTORY] Cleanup failed.`);
    }
  }
  logger.info({ totalReleased }, `📦 [INVENTORY CLEANUP] Scan complete.`);
  return { success: true };
}

export async function handleBridgeHealth(
  job: Job<JobData>,
  redisClient: Redis
): Promise<{ success: boolean }> {
  const { orgId } = job.data;
  if (!orgId) throw new Error('Missing orgId for health-check job');
  
  const org = await getOrgById(orgId);
  if (!org || !org.config?.adminPhone) return { success: true };

  const heartbeatKey = `bridge_heartbeat:${orgId}`;
  const lastHeartbeat = await redisClient.get(heartbeatKey);
  const lastAlertKey = `bridge_offline_alert:${orgId}`;
  const hasRecentlyAlerted = await redisClient.get(lastAlertKey);

  if (lastHeartbeat) {
    const now = Date.now();
    const diffMinutes = (now - parseInt(lastHeartbeat)) / (1000 * 60);

    // 🛡️ [RED TEAM]: Implement grace period from config
    if (diffMinutes > SystemConfig.LIMITS.BRIDGE_OFFLINE_GRACE_MINUTES && !hasRecentlyAlerted) {
       logger.warn({ orgId, diffMinutes: Math.floor(diffMinutes) }, `🚨 [GUARDIAN] Bridge is OFFLINE.`);
       
       const offlineMsg = `🚨 *Bridge Offline Alert*\n\nOga, your SMS Bridge for *${org.name}* hasn't sent a heartbeat for over ${SystemConfig.LIMITS.BRIDGE_OFFLINE_GRACE_MINUTES} minutes.\n\nI cannot verify bank transfers automatically until it's back online! Please check your bridge device.`;
       
       const tenantWhatsAppService = new WhatsAppService(
         org.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN || '',
         org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || '',
         org.config?.appSecret || process.env.WHATSAPP_APP_SECRET
       );

       await tenantWhatsAppService.sendText(org.config.adminPhone, offlineMsg);
       await logSystemEvent(org.id, 'BRIDGE_OFFLINE_ALERT', `Sent alert to Boss: Bridge offline for ${Math.floor(diffMinutes)} mins.`);
       
       // 🛡️ [RED TEAM]: Implement 24h cooldown to prevent alarm fatigue
       await redisClient.setex(lastAlertKey, 86400, '1');
    } else if (diffMinutes <= SystemConfig.LIMITS.BRIDGE_OFFLINE_GRACE_MINUTES) {
       if (hasRecentlyAlerted) {
          logger.info({ orgId }, `✅ [GUARDIAN] Bridge is back ONLINE.`);
          await logSystemEvent(org.id, 'BRIDGE_RESTORED', 'Bridge heartbeat detected after outage.');
          await redisClient.del(lastAlertKey);
       }
    }
  }
  return { success: true };
}

export async function handleTemplateSend(
  job: Job<JobData>
): Promise<{ success: boolean }> {
  const { from, content, phoneId } = job.data;
  if (!content.templateName) {
    throw new Error('Missing templateName for send-template job');
  }

  let tenantWhatsAppService = new WhatsAppService(
    process.env.WHATSAPP_API_TOKEN || '',
    phoneId || process.env.WHATSAPP_PHONE_ID || '',
    process.env.WHATSAPP_APP_SECRET
  );

  // Dynamic token lookup for multi-tenant outbound
  if (phoneId) {
    const org = await getOrgByPhoneId(phoneId);
    if (org?.config?.whatsappToken) {
      tenantWhatsAppService = new WhatsAppService(
        org.config.whatsappToken, 
        phoneId, 
        org.config.appSecret
      );
    }
  }

  logger.info({ to: from, template: content.templateName, phoneId }, `Sending template`);
  await tenantWhatsAppService.sendTemplate(from, content.templateName, content.languageCode || 'en_US');
  return { success: true };
}

export async function handleRequestOtp(
  job: Job<JobData>
): Promise<{ success: boolean }> {
  const { tenantId, phoneId, accessToken, wabaId } = job.data as any;
  if (!tenantId || !phoneId || !accessToken) {
    throw new Error('Missing required activation details (tenantId, phoneId, accessToken)');
  }

  const org = await getOrgById(tenantId);
  if (!org) throw new Error(`Tenant ${tenantId} not found`);

  // 1. Store metadata for Auto-Activation (Auto-Ignition)
  const { getDb } = await import('@naija-agent/firebase');
  await (await getDb()).collection('organizations').doc(tenantId).update({ 
    status: 'AWAITING_OTP',
    pendingSetup: {
      phoneId,
      accessToken,
      wabaId: wabaId || null,
      initiatedAt: new Date().toISOString()
    },
    updatedAt: new Date()
  });

  // 2. Trigger Meta OTP request
  const tenantService = new WhatsAppService(accessToken, phoneId, process.env.WHATSAPP_APP_SECRET);
  try {
    logger.info({ tenantId }, `📡 [RELAY] Requesting Meta code...`);
    await tenantService.requestCode('SMS');
  } catch (metaErr: any) {
    logger.error({ tenantId, error: metaErr.message }, `❌ [RELAY] Meta Code Request Failed.`);
    // Don't throw yet, still notify the Boss that we tried
  }

  // 3. Ping the Boss
  if (org.config?.adminPhone) {
    const activationService = new WhatsAppService(
      process.env.WHATSAPP_API_TOKEN || '',
      process.env.WHATSAPP_PHONE_ID || '',
      process.env.WHATSAPP_APP_SECRET
    );

    const relayMsg = `📢 *ACTIVATION READY*\n\nOga Boss is ready to move your bot to the cloud. Are you holding the phone for SIM *${org.config?.botPhone || 'N/A'}*?\n\nI have just sent your 6-digit activation code via WhatsApp message or SMS. \n\n*Action:* Simply type the 6-digit code here!`;
    await activationService.sendText(org.config.adminPhone, relayMsg);
    logger.info({ orgId: org.id, adminPhone: org.config.adminPhone }, `✅ [RELAY] Initiated for Org.`);
  }

  return { success: true };
}

export async function handleSystemOutbound(
  job: Job<JobData>
): Promise<{ success: boolean }> {
  const { from, content, phoneId } = job.data;
  logger.info({ to: from, phoneId }, `📡 [SYSTEM OUTBOUND] Sending message`);
  
  const masterWhatsAppService = new WhatsAppService(
    process.env.WHATSAPP_API_TOKEN || '',
    process.env.WHATSAPP_PHONE_ID || '',
    process.env.WHATSAPP_APP_SECRET
  );

  if (content.text) {
    await masterWhatsAppService.sendText(from, content.text);
  } else if (content.templateName) {
    await masterWhatsAppService.sendTemplate(from, content.templateName, content.languageCode || 'en_US');
  }
  return { success: true };
}
