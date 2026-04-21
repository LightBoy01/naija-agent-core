import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import pino from 'pino';
import { JobData, SystemConfig, StaffData, parseAndFormatPhone } from '@naija-agent/types';
import { WhatsAppService } from './services/whatsapp.js';
import { GoogleGenAI } from '@google/genai';
import { getProvider, PaymentProvider } from '@naija-agent/payments';
import { getTenantTools } from './tools.js';
import { logger } from './utils/logger.js';
import { 
  getOrgById, 
  deductBalance,
  addBalance,
  getOrgOnboarding,
  getStaff,
  checkFraud,
  incrementDailyExpenses
} from '@naija-agent/firebase';

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

logger.info('🚀 [VERSION 1.1.0] Worker Service Starting... (Refactored)');

// --- Required Environment Variables ---
if (!process.env.WHATSAPP_API_TOKEN || !process.env.GEMINI_API_KEY) {
  logger.error('CRITICAL: Missing core environment variables (WHATSAPP_API_TOKEN or GEMINI_API_KEY)');
  process.exit(1);
}

// --- Providers & Services ---
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

redisClient.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis Client Error');
});

redisClient.on('connect', () => {
  logger.info('✅ Worker Connected to Redis');
});

let globalPaymentProvider: PaymentProvider | null = null;
if (process.env.PAYSTACK_SECRET_KEY) {
  globalPaymentProvider = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY);
}

const defaultWhatsAppService = new WhatsAppService(
  process.env.WHATSAPP_API_TOKEN || '',
  process.env.WHATSAPP_PHONE_ID || '',
  process.env.WHATSAPP_APP_SECRET
);

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    baseUrl: 'https://aiplatform.googleapis.com',
    apiVersion: 'v1/publishers/google'
  }
});
const whatsappQueue = new Queue('whatsapp-queue', { connection: redisClient as any });

// --- Main Worker ---
const worker = new Worker<JobData>(
  'whatsapp-queue',
  async (job: Job<JobData>) => {
    const { from, orgId, type } = job.data;
    logger.info({ jobId: job.id, orgId, from, type }, `Processing job: ${job.name}`);

    // 1. Dispatch Special Jobs (Non-Messaging)
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
        case 'process-bridge-sms': return await handleSmsBridge(job, whatsappQueue, genAI, defaultWhatsAppService);
      }
    } catch (e: any) {
      logger.error({ jobId: job.id, error: e.message }, 'Special job failed');
      throw e; // Let BullMQ retry
    }

    // 2. System Outbound
    if (orgId === 'system') {
      return await handleSystemOutbound(job);
    }

    if (!orgId) return { success: false, reason: 'Missing orgId' };

    // 3. Rate Limiting (PHASE 8 DYNAMIC CONFIG)
    let currentOrg = await getOrgById(orgId);
    if (!currentOrg) return { success: false, reason: 'Org not found' };

    const rateLimit = currentOrg.config?.rateLimit || { windowSeconds: 60, maxRequests: 10 };
    const rateLimitKey = `rate_limit:${orgId}:${from}`;
    const requestCount = await redisClient.incr(rateLimitKey);
    
    if (requestCount === 1) await redisClient.expire(rateLimitKey, rateLimit.windowSeconds);
    if (requestCount > rateLimit.maxRequests) {
      if (requestCount === rateLimit.maxRequests + 1) await defaultWhatsAppService.sendText(from, "Too many messages. Slow down Oga!");
      return { success: false, reason: 'Rate limited' };
    }

    // 4. Messaging Flow Variables
    let costPerReply = 0;
    let deductionDone = false;

    const fromNormalized = parseAndFormatPhone(from) || from;
    const adminPhoneNormalized = currentOrg.config?.adminPhone ? (parseAndFormatPhone(currentOrg.config.adminPhone) || currentOrg.config.adminPhone) : null;
    const isAdmin = adminPhoneNormalized === fromNormalized;
    
    const onboarding = await getOrgOnboarding(orgId);
    
    // --- MULTI-TENANT SERVICES ---
    // 🛡️ [PHASE 8.4]: Dynamic Sender ID (Fix for "Risky" behavior)
    // Always prefer the phoneId that received the message (job.data.phoneId)
    // If org has custom token, use it. Otherwise use master token.
    const senderPhoneId = job.data.phoneId || currentOrg.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || '';
    const senderToken = currentOrg.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN || '';
    const senderSecret = currentOrg.config?.appSecret || process.env.WHATSAPP_APP_SECRET;

    const tenantWhatsAppService = new WhatsAppService(
      senderToken,
      senderPhoneId,
      senderSecret
    );

    const tenantPaymentProvider = currentOrg.config?.payment
      ? getProvider(currentOrg.config.payment.provider, currentOrg.config.payment.secretKey)
      : globalPaymentProvider;

    // --- ONBOARDING & STATUS GUARDS ---
    const onboardingResult = await handleOnboarding(job, currentOrg, onboarding, tenantWhatsAppService, redisClient);
    if (onboardingResult) return onboardingResult;

    if (!isAdmin && !currentOrg.isActive) {
       await tenantWhatsAppService.sendText(from, `👋 *${currentOrg.name}* is currently offline. Please try again later.`);
       return { success: true };
    }

    // --- IDENTITY & SECURITY ---
    let staffData: StaffData | null = null;
    let isStaff = false;
    if (!isAdmin) {
      staffData = await getStaff(orgId, from);
      isStaff = !!staffData && staffData.isActive;
    }

    if (!isAdmin && !isStaff) {
      const fraudRecord = await checkFraud(from);
      if (fraudRecord) {
        await tenantWhatsAppService.sendText(from, "🛑 Access Denied: Fraud Blacklist.");
        return { success: false, reason: 'FRAUD_BLACKLISTED' };
      }
    }

    // --- COST CALCULATION ---
    const isMaster = currentOrg.config?.isMaster;
    if (!isAdmin && !isMaster) {
        if (type === 'image') costPerReply = currentOrg.costPerImage || SystemConfig.COSTS.IMAGE_PROCESSING_KOBO;
        else if (type === 'document') costPerReply = currentOrg.costPerDocument || SystemConfig.COSTS.DOCUMENT_ANALYSIS_KOBO;
        else costPerReply = currentOrg.costPerReply || SystemConfig.COSTS.REPLY_KOBO;
    }

    // --- BALANCE CHECK & DEDUCTION ---
    if (currentOrg.balance < costPerReply) {
      const currency = currentOrg.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
      const greeting = currentOrg.region === 'NG' ? 'Oga' : 'Hello';
      await tenantWhatsAppService.sendText(from, `🚫 *Service Suspended*\n\n${greeting}, your bot balance is too low to process this request. Please top up to continue service.`);
      return { success: true, reason: 'Low balance' };
    }

    try {
      if (costPerReply > 0) {
        const resultBalance = await deductBalance(orgId, costPerReply);
        if (resultBalance === null) throw new Error('Balance deduction failed');
        deductionDone = true;

        // 🛡️ [PHASE 7.3.0]: Log expense to Visual Ledger (Ghost Data Fix)
        // This ensures the "Visual Ledger" has data to show, even if we don't refund it on error.
        incrementDailyExpenses(orgId, costPerReply).catch(err => {
           logger.warn({ orgId, error: err.message }, 'Failed to update Visual Ledger expenses');
        });
      }

      // --- CORE AI PROCESSING ---
      const currency = currentOrg.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
      const regionRaw = currentOrg.region || 'NG';
      const region: CountryCode = (regionRaw === 'GLOBAL' ? 'NG' : regionRaw) as CountryCode;

      // 🛡️ [PHASE 8.3]: Dynamic Sector Pack Loading
      const sectorId = currentOrg.sector || 'commerce';
      const sectorPack = getSectorPack(sectorId, currency, region);

      const deps: MessagingDependencies = {
        org: currentOrg,
        isAdmin,
        isStaff,
        staffData,
        tenantWhatsAppService,
        tenantPaymentProvider,
        genAI,
        redisClient,
        tenantTools: getTenantTools(isAdmin, isStaff, !!isMaster, !!tenantPaymentProvider, currency, region, sectorPack),
        sectorPack
      };

      const messageResult = await handleMessage(job, deps);

      // --- LOW BALANCE WARNING (Dynamic Threshold) ---
      if (!isAdmin && !isMaster) {
         const newBalance = await deductBalance(orgId, 0); // Get current balance
         const threshold = currentOrg.config?.alerts?.lowBalanceThreshold || 50000;
         
         if (newBalance !== null && newBalance <= threshold) {
            const alertKey = `alert:low_balance:${orgId}`;
            const hasAlerted = await redisClient.get(alertKey);
            
            if (!hasAlerted && currentOrg.config?.adminPhone) {
              const formattedBalance = formatCurrency(newBalance / 100, currency.locale, currency.code);
              const refillAmount = 2000; // Standard refill block
              const formattedRefill = formatCurrency(refillAmount, currency.locale, currency.code);

              let lowBalanceMsg = `⚠️ *LOW BALANCE ALERT*\n\nOga, your bot balance is running low (${formattedBalance}). \n\nPlease top up now to ensure your customers don't get stuck!`;
              
              if (tenantPaymentProvider) {
                 const refillLink = await tenantPaymentProvider.createPaymentLink(orgId, `${orgId}@naijaagent.core`, refillAmount);
                 if (refillLink) lowBalanceMsg += `\n\n💳 *Quick Refill (${formattedRefill}):*\n🔗 ${refillLink}`;
              }
              await tenantWhatsAppService.sendText(currentOrg.config.adminPhone, lowBalanceMsg);
              await redisClient.setex(alertKey, 86400, '1');
            }
         }
      }
      return messageResult;

    } catch (error: any) {
      logger.error({ jobId: job.id, orgId, error: error.message }, `Messaging flow error: ${error.message}`);
      
      // REFUND ON FAILURE
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3) - 1; 
      if (!isAdmin && deductionDone && isFinalAttempt) {
          await addBalance(orgId, costPerReply);
      }

      if (job.attemptsMade < (job.opts.attempts || 3)) throw error;
      
      await tenantWhatsAppService.sendText(from, "I'm having trouble connecting. Please try again later.");
      return { success: false, reason: error.message };
    }
  },
  { connection: redisClient as any, concurrency: 5 }
);

worker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed permanently');

  if (process.env.MASTER_ADMIN_PHONE && process.env.WHATSAPP_API_TOKEN) {
     try {
       const snitchService = new WhatsAppService(
         process.env.WHATSAPP_API_TOKEN,
         process.env.WHATSAPP_PHONE_ID || ''
       );
       const alert = `🚨 *SYSTEM ALERT (Sovereign Snitch)*\n\nJob *${job?.name}* (${job?.id}) failed!\n\nError: ${err.message}\n\nOga, please check the logs immediately.`;
       await snitchService.sendText(process.env.MASTER_ADMIN_PHONE, alert);
     } catch (snitchErr: any) {
       console.error('Sovereign Snitch failed to deliver alert:', snitchErr.message);
     }
  }
});
