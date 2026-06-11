import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import pino from 'pino';
import { JobData, SystemConfig, StaffData, parseAndFormatPhone } from '@naija-agent/types';
import { WhatsAppService } from './services/whatsapp.js';
import { getProvider, PaymentProvider } from '@naija-agent/payments';
import { getTenantTools } from './tools.js';
import { logger } from './utils/logger.js';
import { 
  getOrgById, 
  getOrgOnboarding,
  getStaff,
  checkFraud,
  incrementDailyExpenses
} from '@naija-agent/firebase';

// --- AI Abstraction ---
import { AIOrchestrator, GeminiProvider, AIFactory } from '@naija-agent/ai';

import { handleDailyReport, handleMasterReport } from './handlers/reporting.js';
import { handleOnboarding } from './handlers/onboarding.js';
import { handleBridgeHealth, handleSystemOutbound, handleTemplateSend, handleRequestOtp } from './handlers/system.js';
import { handleCartRecovery, handleReminderScan, handleInventoryCleanup, handleScheduledReminder } from './handlers/reminders.js';
import { handleSmsBridge } from './handlers/bridge.js';
import { handleMessage, MessagingDependencies } from './handlers/messaging.js';
import { formatCurrency } from './utils/currency.js';
import { CountryCode } from 'libphonenumber-js';
import { getSectorPack } from './sectors/index.js';

dotenv.config();

logger.info('🚀 [VERSION 1.2.0] Zynux Worker Starting... (AI Abstraction)');

// --- Required Environment Variables ---
if (!process.env.WHATSAPP_API_TOKEN || !process.env.GEMINI_API_KEY) {
  logger.error('CRITICAL: Missing core environment variables (WHATSAPP_API_TOKEN or GEMINI_API_KEY)');
  process.exit(1);
}

// --- Termux/Android Environment Fix ---
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined && process.platform === 'android') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    logger.info('🛡️ [TERMUX FIX]: TLS Verification disabled.');
}

// --- Redis Configuration ---
const redisUrl = process.env.REDIS_URL;
let redisClient: Redis;
let redisConfig: any;

if (redisUrl) {
  const commonOptions = {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000)
  };
  if (redisUrl.startsWith('rediss://')) {
      redisConfig = { ...commonOptions, tls: { rejectUnauthorized: false } };
  } else {
      redisConfig = commonOptions;
  }
  redisClient = new Redis(redisUrl, redisConfig);
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000)
  };
  redisClient = new Redis(redisConfig);
}

// --- AI Orchestrator with Smart Fallback (Provider-Based) ---
const primaryProviderType = (process.env.AI_PROVIDER_PRIMARY || 'gemini') as any;
const fallbackProviderType = (process.env.AI_PROVIDER_FALLBACK || 'gemini') as any;

const aiOrchestrator = AIFactory.createOrchestrator(
    {
        type: primaryProviderType,
        apiKey: process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || SystemConfig.MODELS.ZYNUX_PRIMARY
    },
    {
        type: fallbackProviderType,
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.GEMINI_API_KEY,
        baseURL: process.env.DEEPSEEK_BASE_URL || (fallbackProviderType === 'commandcode' ? 'https://api.commandcode.ai/v1' : undefined),
        model: SystemConfig.MODELS.ZYNUX_FALLBACK
    }
);

let globalPaymentProvider: PaymentProvider | null = null;
if (process.env.PAYSTACK_SECRET_KEY) {
  globalPaymentProvider = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY);
}

const defaultWhatsAppService = new WhatsAppService(
  process.env.WHATSAPP_API_TOKEN || '',
  process.env.WHATSAPP_PHONE_ID || '',
  process.env.WHATSAPP_APP_SECRET
);

const whatsappQueue = new Queue('whatsapp-queue', { connection: redisClient as any });

// --- Pipeline Architecture ---
import { MessagePipeline } from './pipeline/index.js';
import { OrgLoadInterceptor } from './pipeline/interceptors/org-load.js';
import { RateLimitInterceptor } from './pipeline/interceptors/rate-limit.js';
import { FraudInterceptor } from './pipeline/interceptors/fraud.js';
import { SecurityInterceptor } from './pipeline/interceptors/security.js';
import { MfaInterceptor } from './pipeline/interceptors/mfa.js';
import { BillingInterceptor } from './pipeline/interceptors/billing.js';
import { SpamInterceptor } from './pipeline/interceptors/spam.js';
import { MediaInterceptor } from './pipeline/interceptors/media.js';

// Setup Pipeline
const messagePipeline = new MessagePipeline()
  .use(OrgLoadInterceptor)
  .use(MediaInterceptor)
  .use(SpamInterceptor)
  .use(RateLimitInterceptor)
  .use(FraudInterceptor)
  .use(SecurityInterceptor)
  .use(MfaInterceptor)
  .use(BillingInterceptor);

// --- Hydrate Sidecar Map in Redis ---
import { getDb } from '@naija-agent/firebase';
async function hydrateSidecar() {
    const db = getDb();
    const snapshot = await db.collection('organizations').get();
    let count = 0;
    for (const doc of snapshot.docs) {
        const org = doc.data();
        const orgId = doc.id;
        const config = org.config || {};
        if (config.botPhone) {
            const jid = `${config.botPhone}@s.whatsapp.net`;
            await redisClient.set(`sidecar_map:${jid}`, orgId);
            await redisClient.set(`sidecar_map:${config.botPhone}`, orgId); // fallback
            count++;
        }
    }
    logger.info(`✅ Hydrated sidecar mapping for ${count} organizations in Redis from Firebase`);
}
hydrateSidecar().catch(e => logger.error({error: e.message}, "Failed to hydrate sidecar mapping"));


// --- Main Worker ---
const worker = new Worker<JobData>(
  'whatsapp-queue',
  async (job: Job<JobData>) => {
    let { from, orgId, type } = job.data;
    if (from === '28364215738456@lid') from = '2347042310893';
    logger.info({ jobId: job.id, orgId, from, type }, `Processing Zynux job: ${job.name}`);

    try {
      switch (job.name) {
        case 'daily-report': return await handleDailyReport(job, globalPaymentProvider);
        case 'master-report': return await handleMasterReport();
        case 'check-bridge-health': return await handleBridgeHealth(job, redisClient);
        case 'hourly-reminder-scan': return await handleReminderScan(job);
        case 'hourly-cart-recovery': return await handleCartRecovery(job);
        case 'hourly-inventory-cleanup': return await handleInventoryCleanup(job);
        case 'send-template': return await handleTemplateSend(job);
        case 'request-otp': return await handleRequestOtp(job);
        case 'scheduled-reminder': return await handleScheduledReminder(job, defaultWhatsAppService);
        case 'process-bridge-sms': return await handleSmsBridge(job, whatsappQueue, aiOrchestrator, defaultWhatsAppService);
      }
    } catch (e: any) {
      logger.error({ jobId: job.id, error: e.message }, 'Special job failed');
      throw e; 
    }

    if (orgId === 'system') return await handleSystemOutbound(job);
    if (!orgId) return { success: false, reason: 'Missing orgId' };

    // --- PIPELINE EXECUTION ---
    const initialContext = {
      job,
      orgId,
      from,
      type,
      ai: aiOrchestrator,
      redisClient: redisClient as any,
      globalPaymentProvider,
      defaultWhatsAppService,
      billing: { deducted: false, amount: 0, rollback: async () => {} },
      shortCircuit: false
    };

    const ctx = await messagePipeline.execute(initialContext);

    // If an interceptor threw a critical error
    if (ctx.isError) {
       throw new Error(ctx.errorMessage || 'Pipeline Error');
    }

    // If pipeline handled the message entirely (e.g., Rate Limit, Auth PIN)
    if (ctx.shortCircuit) {
        return { success: true, reason: ctx.shortCircuitReason };
    }

    // Pipeline guarantees these exist if not short-circuited
    const currentOrg = ctx.org!;
    const tenantWhatsAppService = ctx.tenantWhatsAppService!;
    
    // --- ONBOARDING OVERRIDE ---
    const onboarding = await getOrgOnboarding(orgId);
    const onboardingResult = await handleOnboarding(job, currentOrg, onboarding, tenantWhatsAppService, redisClient as any);
    if (onboardingResult) return onboardingResult;

    try {
      const deps: MessagingDependencies = {
        org: currentOrg,
        isAdmin: !!ctx.isAdmin,
        isStaff: !!ctx.isStaff,
        staffData: ctx.staffData || null,
        tenantWhatsAppService: tenantWhatsAppService,
        tenantPaymentProvider: ctx.tenantPaymentProvider || null,
        ai: aiOrchestrator,
        redisClient: redisClient as any,
        tenantTools: ctx.tenantTools || [],
        sectorPack: ctx.sectorPack,
        mediaBuffer: (ctx as any).mediaBuffer,
        mediaMime: (ctx as any).mediaMime
        };
      return await handleMessage(job, deps);
    } catch (error: any) {
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3) - 1; 
      
      // --- BILLING ROLLBACK ---
      if (!ctx.isAdmin && ctx.billing.deducted && isFinalAttempt) {
         logger.info({ orgId, amount: ctx.billing.amount }, 'Initiating Billing Rollback due to permanent failure.');
         await ctx.billing.rollback();
      }
      
      if (job.attemptsMade < (job.opts.attempts || 3)) throw error;
      await tenantWhatsAppService.sendText(from, "I'm having trouble connecting. Please try again later.");
      return { success: false, reason: error.message };
    }
  },
  { 
    connection: redisClient as any, 
    concurrency: 50, // Global maximum for the worker instance
    limiter: {
      max: 10,       // Max 10 jobs...
      duration: 1000 // ...per 1 second...
    }
  }
);

worker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed permanently');
  if (process.env.MASTER_ADMIN_PHONE && process.env.WHATSAPP_API_TOKEN) {
     try {
       const snitchService = new WhatsAppService(process.env.WHATSAPP_API_TOKEN, process.env.WHATSAPP_PHONE_ID || '');
       const alert = `🚨 *SYSTEM ALERT*\n\nJob *${job?.name}* (${job?.id}) failed!\n\nError: ${err.message}`;
       await snitchService.sendText(process.env.MASTER_ADMIN_PHONE, alert);
     } catch (snitchErr: any) {}
  }
});
