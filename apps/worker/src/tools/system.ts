import { HandlerContext } from './definitions.js';
import { 
  createTenant, 
  topupTenant, 
  getActiveOrganizations, 
  logSystemEvent, 
  getOrgStats, 
  reportFraud, 
  getDb, 
  registerTrialInterest, 
  getOrgById, 
  activateTenant, 
  getPendingSetups, 
  getNetworkStats, 
  setMfaCode 
} from '@naija-agent/firebase';
import { Queue } from 'bullmq';
import { formatCurrency } from '../utils/currency.js';

export async function handleSystemTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isAdmin, whatsappService, redisClient, orgConfig, currency } = ctx;

  switch (name) {
    case 'create_tenant': {
      await createTenant({
        id: args.id,
        name: args.name,
        whatsappPhoneId: args.phoneId,
        adminPhone: args.adminPhone,
        systemPrompt: args.prompt,
        timezone: args.timezone
      });
      
      if (args.wabaId) {
         await whatsappService.subscribeWaba(args.wabaId);
      }
      return { status: 'success', message: `Tenant '${args.name}' created. Proactive pulse active via Global Cron.` };
    }

    case 'topup_tenant': {
      const result = await topupTenant(args.tenantId, args.amount, args.reference);
      if (result) {
        return { status: 'success', message: `Successfully added ${formatCurrency(args.amount, currency.locale, currency.code)} to ${args.tenantId}. New balance: ${formatCurrency(result.newBalance / 100, currency.locale, currency.code)}.` };
      }
      return { status: 'error', message: 'Top-up failed. Reference might be used.' };
    }

    case 'suspend_tenant': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      // --- DYNAMIC MFA PROTECTION (PHASE 9.3) ---
      if (process.env.NODE_ENV === 'production') {
          const { verifyMfaCode, setMfaCode } = await import('@naija-agent/firebase');
          const isVerified = args.mfa_code ? await verifyMfaCode(orgId, args.mfa_code) : false;

          if (!isVerified) {
              const code = Math.floor(100000 + Math.random() * 900000).toString();
              await setMfaCode(orgId, code, 5); // 5 min expiry
              return { 
                status: 'error', 
                code: 'MFA_REQUIRED', 
                message: "Oga, suspending a business is a heavy action. I have generated a 6-digit security code. Please check your logs and call 'suspend_tenant' again with the 'mfa_code' to confirm." 
              };
          }
      }

      const { suspendOrganization } = await import('@naija-agent/firebase');
      await suspendOrganization(args.tenantId, args.reason);
      await logSystemEvent('naija-agent-master', 'TENANT_SUSPENDED', `Tenant ${args.tenantId} was suspended by Sovereign.`, { reason: args.reason, suspendedBy: from });
      
      return { status: 'success', message: `Tenant '${args.tenantId}' has been instantly SUSPENDED. All AI and API services are now blocked.` };
    }

    case 'broadcast_to_bosses': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      // --- DYNAMIC MFA PROTECTION (PHASE 9.3) ---
      if (process.env.NODE_ENV === 'production') {
          const { verifyMfaCode, setMfaCode } = await import('@naija-agent/firebase');
          const isVerified = args.mfa_code ? await verifyMfaCode(orgId, args.mfa_code) : false;

          if (!isVerified) {
              const code = Math.floor(100000 + Math.random() * 900000).toString();
              await setMfaCode(orgId, code, 10); // 10 min expiry
              
              logger.info({ orgId }, '🔐 [SECURITY] Sovereign MFA Challenge generated for Broadcast');
              
              // In a production Empire, we would send this to the Sovereign's PRIVATE backup channel (e.g. Email)
              return { 
                status: 'error', 
                code: 'MFA_REQUIRED', 
                message: "Oga, this broadcast will hit 1,000+ people. I have generated a 6-digit security code for your protection. Please check your system logs or secondary channel and call 'broadcast_to_bosses' again with the 'mfa_code'." 
              };
          }
      }

      await logSystemEvent('naija-agent-master', 'GLOBAL_BROADCAST', `Sovereign HQ sent a network-wide broadcast to all Bosses.`, { message: args.message });

      const orgs = await getActiveOrganizations();
      let count = 0;

      const whatsappQueue = new Queue('whatsapp-queue', { 
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        }
      });

      for (const org of orgs) {
        if (org.config?.adminPhone) {
          await whatsappQueue.add('process-message', {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: org.config.adminPhone,
            timestamp: Date.now(),
            content: { text: `📣 *SOVEREIGN DECREE*\n\n${args.message}` }
          }, { 
            delay: count * 5000, 
            removeOnComplete: true 
          });
          count++;
        }
      }
      return { status: 'success', message: `Broadcast queued for ${count} Bosses with 5s jitter.` };
    }

    case 'audit_tenant': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const { getTenantAuditStats } = await import('@naija-agent/firebase');
      await logSystemEvent(args.tenantId, 'SOVEREIGN_AUDIT', `Sovereign HQ performed a performance audit of your business stats.`, { auditedBy: from });

      const auditStats = await getTenantAuditStats(args.tenantId);
      if (!auditStats) return { status: 'error', message: 'Tenant not found.' };

      const heartbeatKey = `bridge_heartbeat:${args.tenantId}`;
      const lastHeartbeat = await redisClient.get(heartbeatKey);
      const now = Date.now();
      
      let bridgeStatus = 'OFFLINE';
      let diagnosis = "✅ Healthy. No critical issues found.";
      const warnings: string[] = [];

      // 1. Bridge Check
      if (lastHeartbeat) {
        const diffMinutes = (now - parseInt(lastHeartbeat)) / (1000 * 60);
        if (diffMinutes <= 15) {
           bridgeStatus = 'ONLINE';
        } else if (diffMinutes <= 60) {
           bridgeStatus = 'LAGGING';
           warnings.push(`⚠️ SMS Bridge lagging (${Math.floor(diffMinutes)}m ago).`);
        } else {
           bridgeStatus = 'OFFLINE';
           diagnosis = `❌ SMS Bridge is OFFLINE (Last seen ${Math.floor(diffMinutes/60)}h ago). Check internet on Android phone.`;
        }
      } else {
        diagnosis = `❌ SMS Bridge NEVER reported. Is the App installed?`;
      }

      // 2. Balance Check
      if ((auditStats.balance || 0) < 100000) { // < 1k NGN
         warnings.push(`⚠️ Low Balance (${formatCurrency(auditStats.balance/100, currency.locale, currency.code)}).`);
      }

      return { 
        status: 'success', 
        data: {
          ...auditStats,
          bridgeStatus,
          lastSeen: lastHeartbeat ? new Date(parseInt(lastHeartbeat)).toISOString() : 'Never',
          diagnosis,
          warnings
        } 
      };
    }

    case 'report_fraud': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      // 1. Log to legacy Firestore (Raw phone)
      await reportFraud(args.phone, args.reason);
      
      // 2. Log to Privacy-First Global Registry (Hashed phone)
      const phoneHash = (await import('crypto')).createHash('sha256').update(args.phone).digest('hex');
      const { getDb, fraudRegistry } = await import('@naija-agent/database');
      const db = getDb();
      
      // We use the Reporting Org ID to ensure consensus logic works
      await db.insert(fraudRegistry).values({
        phoneHash,
        orgId: args.orgId || orgId, // Allow Master to report on behalf of others
        reason: args.reason,
        evidenceUrl: args.evidenceUrl || null
      }).onConflictDoUpdate({
          target: [fraudRegistry.phoneHash, fraudRegistry.orgId],
          set: { 
            reason: args.reason,
            createdAt: new Date() // Refresh report date
          }
      });

      return { status: 'success', message: `Customer ${args.phone} added to Global Fraud Blacklist (Network Protected).` };
    }

    case 'register_trial_interest': {
      const dbInstance = getDb();
      const existing = await dbInstance.collection('organizations').doc(args.id).get();
      
      if (existing.exists) {
        const suggestions = [
           `${args.id}_ng`,
           `${args.id}_apprentice`,
           `${args.id}_${new Date().getFullYear()}`
        ];
        return { 
          status: 'error', 
          code: 'ID_TAKEN', 
          message: `Oga, another Boss don already use the ID "${args.id}"! No shaking, we fit use one of these available ones instead: \n\n1. *${suggestions[0]}*\n2. *${suggestions[1]}*\n3. *${suggestions[2]}*\n\nWetin you think? You fit just type the one you like!`,
          suggestions 
        };
      }

      const existingBossOrg = await (await import('@naija-agent/firebase')).findOrgByAdminPhone(args.adminPhone);
      let bossContext = "";
      if (existingBossOrg) {
         bossContext = `\n\n*Note:* I see you already manage "${existingBossOrg.name}". No problem, I will set this one up separately!`;
      }

      await registerTrialInterest({
        id: args.id,
        name: args.name,
        adminPhone: args.adminPhone,
        botPhone: args.botPhone,
        timezone: args.timezone
      });
      
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://aijobspot.online';
      const setupUrl = `${siteUrl}/setup/${args.id}`;

      if (process.env.MASTER_ADMIN_PHONE) {
        const alert = `🆕 *NEW TRIAL LEAD*\n\nBusiness: ${args.name}\nBoss: ${args.adminPhone}\nBot SIM: ${args.botPhone}\n\nOga, please verify credit payment then add to Meta.`;
        await whatsappService.sendText(process.env.MASTER_ADMIN_PHONE, alert);
      }
      
      return { 
        status: 'success', 
        setupUrl,
        message: `Interest registered for ${args.name}. Oga Sovereign has been notified. We will send your activation code shortly.${bossContext}\n\n👉 *Fast-Track:* You fit complete your setup and connect your WhatsApp instantly by clicking this link: \n🔗 ${setupUrl}` 
      };
    }

    case 'request_otp_relay': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      const pendingTenant = await getOrgById(args.tenantId);
      
      if (!pendingTenant) return { status: 'error', message: 'Tenant not found.' };
      if (!['PENDING_PAYMENT', 'PENDING_META', 'AWAITING_OTP'].includes(pendingTenant.status)) {
         return { status: 'error', message: `Tenant is not in a pending state (Status: ${pendingTenant.status}).` };
      }

      // Store metadata for Auto-Activation (Auto-Ignition)
      await (await getDb()).collection('organizations').doc(args.tenantId).update({ 
        status: 'AWAITING_OTP',
        pendingSetup: {
          phoneId: args.phoneId,
          accessToken: args.accessToken,
          wabaId: args.wabaId,
          initiatedAt: new Date().toISOString()
        }
      });

      if (pendingTenant.config?.adminPhone) {
        const relayMsg = `📢 *ACTIVATION READY*\n\nOga Boss is ready to move your bot to the cloud. Are you holding the phone for SIM *${pendingTenant.config?.botPhone || 'N/A'}*?\n\nPlease type *READY* to receive your 5-minute activation code. Once you see the 6-digit code, just send it here!`;
        await whatsappService.sendText(pendingTenant.config.adminPhone, relayMsg);
      }

      return { status: 'success', message: `Relay initiated for ${args.tenantId}. Client notified.` };
    }

    case 'activate_tenant': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      
      await activateTenant(args.tenantId, args.phoneId, args.accessToken);
      
      const pipe = await getPendingSetups();
      const target = pipe.find(t => t.id === args.tenantId);

      const successKit = `🎉 *CONGRATULATIONS!*\n\nYour Digital Apprentice is now LIVE!\n\n*Your Next 3 Steps:* \n1. Message your new bot number.\n2. Type *#setup* to name your shop.\n3. Add your first product!\n\nGo kill it! 🚀`;
      if (target?.config?.adminPhone) {
        await whatsappService.sendText(target.config.adminPhone, successKit);
      }

      return { status: 'success', message: `Tenant ${args.tenantId} is now ACTIVE and notified.` };
    }

    case 'get_pending_setups': {
      if (!isAdmin || !orgConfig?.isMaster) return { status: 'error', code: 'UNAUTHORIZED' };
      const setups = await getPendingSetups();
      if (setups.length === 0) return { status: 'success', message: 'Pipeline is empty. No pending setups.' };

      const setupSummary = setups.map((t, i) => `${i+1}. *${t.name}* (${t.status}) - SIM: ${t.config?.botPhone || 'N/A'}`).join('\n');
      return { status: 'success', message: `🚩 *SETUP PIPELINE*\n\n${setupSummary}` };
    }

    case 'get_network_stats': {
      const stats = await getNetworkStats(orgId);
      return { status: 'success', data: stats };
    }

    case 'generate_login_code': {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await setMfaCode(orgId, code);
      return { status: 'success', code, message: 'Code generated. Share with the Boss. It expires in 5 minutes.' };
    }

    case 'schedule_reminder': {
      // args: { message: string, delaySeconds: number }
      // BullMQ Delay is in ms
      const delay = Math.max(args.delaySeconds * 1000, 5000); // Min 5 seconds

      const whatsappQueue = new Queue('whatsapp-queue', { 
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        }
      });

      await whatsappQueue.add('scheduled-reminder', {
        orgId,
        to: from, // Send back to the user who requested it
        message: args.message
      }, { 
        delay,
        removeOnComplete: true 
      });

      // Calculate relative time for friendly response
      const minutes = Math.floor(args.delaySeconds / 60);
      const hours = Math.floor(minutes / 60);
      let timeDesc = `${args.delaySeconds} seconds`;
      if (hours > 0) timeDesc = `${hours} hours`;
      else if (minutes > 0) timeDesc = `${minutes} minutes`;

      return { status: 'success', message: `Done. I will remind you in ${timeDesc}.` };
    }

    default:
      return null;
  }
}
