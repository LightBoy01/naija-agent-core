import { Job } from 'bullmq';
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { 
  getOrgById,
  getOrgByPhoneId,
  getActiveOrganizations,
  releaseExpiredReservations
} from '@naija-agent/firebase';
import { logSystemEvent } from '@naija-agent/database';
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
  let metaFailed = false;
  let metaError = '';
  try {
    logger.info({ tenantId }, `📡 [RELAY] Requesting Meta code...`);
    await tenantService.requestCode('SMS');
  } catch (metaErr: any) {
    logger.error({ tenantId, error: metaErr.message }, `❌ [RELAY] Meta Code Request Failed.`);
    metaFailed = true;
    metaError = metaErr.message;
  }

  // 3. Ping the Boss
  if (org.config?.adminPhone) {
    const activationService = new WhatsAppService(
      process.env.WHATSAPP_API_TOKEN || '',
      process.env.WHATSAPP_PHONE_ID || '',
      process.env.WHATSAPP_APP_SECRET
    );

    const relayMsg = metaFailed
      ? `⚠️ *ACTIVATION ISSUE*\n\nOga, I tried to send the 6-digit code but Meta failed: *${metaError}*\n\nThis is usually temporary. Please try again in a few minutes or ask the Sovereign to help with the Meta Cloud API registration.`
      : `📢 *ACTIVATION READY*\n\nOga Boss is ready to move your bot to the cloud. Are you holding the phone for SIM *${org.config?.botPhone || 'N/A'}*?\n\nI have just sent your 6-digit activation code via WhatsApp message or SMS. \n\n*Action:* Simply type the 6-digit code here!`;

    await activationService.sendText(org.config.adminPhone, relayMsg);
    logger.info({ orgId: org.id, adminPhone: org.config.adminPhone }, `✅ [RELAY] Initiated for Org.`);
  }

  return { success: true };
}

export async function handleSystemOutbound(
  job: Job<JobData>,
  defaultWhatsAppService: WhatsAppService
): Promise<{ success: boolean }> {
  const { from, content, phoneId } = job.data;
  logger.info({ to: from, phoneId }, `📡 [SYSTEM OUTBOUND] Sending message`);
  
  const masterWhatsAppService = defaultWhatsAppService;

  if (content.text) {
    await masterWhatsAppService.sendText(from, content.text);
  } else if (content.templateName) {
    await masterWhatsAppService.sendTemplate(from, content.templateName, content.languageCode || 'en_US');
  }
  return { success: true };
}
