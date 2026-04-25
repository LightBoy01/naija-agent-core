import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import dotenv from 'dotenv';
import pino from 'pino';

// Configure Structured Logging
const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

logger.info('🚀 [VERSION 1.1.0] API Service Starting... (Standardized Logging)');

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { z } from 'zod';
import { 
  WhatsAppWebhookSchema, 
  JobData, 
  WhatsAppMessage,
  parseAndFormatPhone 
} from '@naija-agent/types';
import { 
  getOrgByPhoneId, 
  setOptOut, 
  checkOptOut,
  getDb,
  findPendingTransaction,
  confirmTransaction,
  topupTenant,
  getOrgById,
  getActiveOrganizations,
  getOrgDailyStats,
  getOrgByBridgeSecret,
  getNetworkStats
} from '@naija-agent/firebase';
import { getProvider } from '@naija-agent/payments';
import { formatCurrency } from './utils/currency.js';
import legacyBridgeRoutes from './routes/legacy-bridge.js';

dotenv.config();

// Ensure required environment variables are present
if (!process.env.WHATSAPP_APP_SECRET) {
  logger.error('CRITICAL: WHATSAPP_APP_SECRET is not defined in environment variables.');
  process.exit(1);
}

const fastify = Fastify({ 
  logger: logger
});

fastify.setErrorHandler((error, request, reply) => {
  logger.error({ err: error.message, stack: error.stack }, '🔥 [CRITICAL ERROR]');
  reply.status(500).send({ error: 'Internal Server Error', details: error.message });
});

// Register Raw Body plugin to access raw payload for signature verification
fastify.register(fastifyRawBody, {
  field: 'rawBody',
  global: true,
  encoding: 'utf8',
  runFirst: true,
  routes: [] 
});

// GLOBAL DEBUG: Log EVERY request before any processing
fastify.addHook('onRequest', async (request, reply) => {
  const SENSITIVE_KEYS = [
    'x-api-key', 'x-bridge-secret', 'x-cron-secret', 'authorization', 
    'x-hub-signature-256', 'x-paystack-signature', 'monnify-signature',
    'pin', 'password', 'token', 'secret', 'key', 'access_token', 'refresh_token'
  ];

  const deepRedact = (obj: any, depth = 0): any => {
    if (depth > 3 || !obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => deepRedact(item, depth + 1));
    }

    const newObj: any = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        const lowerK = k.toLowerCase();
        const isSensitive = SENSITIVE_KEYS.some(sk => lowerK.includes(sk));
        
        if (isSensitive) {
          newObj[k] = '***REDACTED***';
        } else {
          newObj[k] = deepRedact(obj[k], depth + 1);
        }
      }
    }
    return newObj;
  };

  const safeHeaders = deepRedact({ ...request.headers });
  const safeQuery = deepRedact({ ...(request.query as object) });
  
  // Note: Body is not parsed yet at 'onRequest', so we can't redact it here.
  // We rely on the content type parser hook for body logging.

  logger.info({ 
    method: request.method, 
    url: request.url, 
    headers: safeHeaders,
    query: safeQuery
  }, '🔵 [INCOMING REQUEST]');
});

fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  if (body instanceof Buffer) {
    const bodyStr = body.toString('utf8');
    logger.debug({ body: bodyStr.substring(0, 100) + '...' }, '📦 [DEBUG] Raw Body Received');
    (req as any).rawBody = bodyStr;
    try {
      const json = JSON.parse(bodyStr);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  } else {
    logger.warn('⚠️ [DEBUG] Body is not a Buffer!');
    done(null, undefined);
  }
});

// --- Redis & Queue Setup ---
const redisUrl = process.env.REDIS_URL;
let redisConnection: Redis;
let redisConfig: any;

if (redisUrl) {
  const commonOptions = {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000)
  };
  
  // If it's a rediss:// URL, ioredis requires tls options to be explicitly set
  // However, passing the URL string directly is the most reliable method for ioredis parsing.
  if (redisUrl.startsWith('rediss://')) {
      redisConfig = { ...commonOptions, tls: { rejectUnauthorized: false } };
  } else {
      redisConfig = commonOptions;
  }
  
  redisConnection = new Redis(redisUrl, redisConfig);
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000)
  };
  redisConnection = new Redis(redisConfig);
}

redisConnection.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis Connection Error');
});

redisConnection.on('connect', () => {
  logger.info('✅ Connected to Redis');
});

const whatsappQueue = new Queue('whatsapp-queue', { connection: redisConnection });
const lifeQueue = new Queue('life-queue', { connection: redisConnection });

// --- Helpers ---

// Verify X-Hub-Signature-256
function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const calculated = 'sha256=' + hmac.update(payload).digest('hex');
  logger.debug({ received: signature, calculated }, '🛡️ [DEBUG] Signature Verification');
  const digest = Buffer.from(calculated, 'utf8');
  const checksum = Buffer.from(signature, 'utf8');
  return digest.length === checksum.length && crypto.timingSafeEqual(digest, checksum);
}

// --- Routes ---

// 1. Health Check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// 2. Webhook Verification (GET)
fastify.get('/webhook', async (request, reply) => {
  const query = request.query as {
    'hub.mode': string;
    'hub.verify_token': string;
    'hub.challenge': string;
  };

  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    reply.status(200).send(challenge);
  } else {
    reply.status(403).send('Forbidden');
  }
});

// 3. Webhook Ingestion (POST)
fastify.post('/webhook/paystack', async (request, reply) => {
  const signature = request.headers['x-paystack-signature'] as string;
  const rawBody = request.rawBody as string;

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return reply.status(500).send('Paystack secret key not configured');
  }

  const paystack = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY) as any;
  
  if (!paystack.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('❌ Invalid Paystack Webhook Signature!');
    return reply.status(403).send('Invalid Signature');
  }

  const payload = request.body as any;
  if (payload.event !== 'charge.success') {
    return reply.status(200).send('Ignored');
  }

  const { reference, amount, metadata } = payload.data;
  const orgId = metadata?.orgId;

  if (!orgId) {
    logger.warn({ reference }, '⚠️ Received Paystack top-up without orgId metadata.');
    return reply.status(200).send('OK'); // Acknowledge anyway
  }

  try {
    const amountVal = amount / 100; // Paystack sends amount in Kobo/Cents
    const result = await topupTenant(orgId, amountVal, reference);

    if (result) {
      const org = await getOrgById(orgId);
      const currency = org?.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
      const formattedAmount = formatCurrency(amountVal, currency.locale, currency.code);
      const formattedBalance = formatCurrency(result.newBalance / 100, currency.locale, currency.code);
      
      logger.info({ orgId, amount: amountVal, reference }, `✅ [PAYSTACK] Processed top-up.`);
      
      if (org?.config?.adminPhone) {
        let notificationMsg = "";
        const greeting = org.region === 'NG' ? 'Oga' : 'Hello';
        
        if (metadata?.purpose === 'refill') {
           notificationMsg = `✅ *AI Credit Refill Successful!*\n\n${greeting}, your account has been credited with *${formattedAmount}* (Ref: ${reference}).\n\nYour new balance is *${formattedBalance}*.`;
        } else {
           notificationMsg = `💰 *NEW SALE CONFIRMED (Paystack)!*\n\n${greeting}, a customer has just paid *${formattedAmount}*.\n\nOrder Ref: ${reference}\nNew Bot Balance: ${formattedBalance}.`;
        }

        const notificationJob: JobData = {
          type: 'text',
          orgId: 'system',
          phoneId: org.whatsappPhoneId,
          from: org.config.adminPhone,
          messageId: `BR-${Date.now()}`,
          timestamp: Date.now(),
          content: { text: notificationMsg }
        };
        await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
      }
    }
  } catch (e: any) {
    if (e.message === 'DUPLICATE_REFERENCE') {
      logger.info({ reference }, '⏭️ [PAYSTACK] Duplicate top-up ignored.');
    } else {
      logger.error({ reference, error: e.message }, '❌ Paystack processing error');
    }
  }

  return reply.status(200).send('OK');
});

// 3b. Webhook Ingestion (Monnify)
fastify.post('/webhook/monnify', async (request, reply) => {
  const signature = request.headers['monnify-signature'] as string;
  const rawBody = request.rawBody as string;

  const payload = request.body as any;
  const reference = payload.eventData?.paymentReference;
  
  let orgId: string | undefined = undefined;
  if (reference && reference.startsWith('refill_')) {
     orgId = reference.split('_')[1];
  }

  if (!orgId) {
    logger.warn({ reference }, '⚠️ Received Monnify webhook without recognizable orgId in reference.');
    return reply.status(200).send('OK');
  }

  const org = await getOrgById(orgId);
  const monnifyKey = org?.config?.payment?.secretKey || process.env.MONNIFY_SECRET_KEY;

  if (!monnifyKey) {
    return reply.status(500).send('Monnify secret key not found');
  }

  const monnify = getProvider('monnify', monnifyKey) as any;
  
  if (!monnify.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('❌ Invalid Monnify Webhook Signature!');
    return reply.status(403).send('Invalid Signature');
  }

  if (payload.eventType !== 'SUCCESSFUL_TRANSACTION') {
    return reply.status(200).send('Ignored');
  }

  const amountPaid = payload.eventData.amountPaid;

  try {
    const result = await topupTenant(orgId, amountPaid, reference);

    if (result) {
      logger.info({ orgId, amount: amountPaid, reference }, `✅ [MONNIFY] Processed top-up.`);
      
      if (org?.config?.adminPhone) {
        const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
        const formattedAmount = formatCurrency(amountPaid, currency.locale, currency.code);
        const formattedBalance = formatCurrency(result.newBalance / 100, currency.locale, currency.code);

        const notificationMsg = `✅ *AI Credit Refill Successful (Monnify)!*\n\nOga, your account has been credited with *${formattedAmount}*.\n\nYour new balance is *${formattedBalance}*.`;

        const notificationJob: JobData = {
          type: 'text',
          orgId: 'system',
          phoneId: org.whatsappPhoneId,
          from: org.config.adminPhone,
          messageId: `BR-${Date.now()}`,
          timestamp: Date.now(),
          content: { text: notificationMsg }
        };
        await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
      }
    }
  } catch (e: any) {
    if (e.message !== 'DUPLICATE_REFERENCE') logger.error({ reference, error: e.message }, '❌ Monnify processing error');
  }

  return reply.status(200).send('OK');
});

// 3c. Webhook Ingestion (WhatsApp)
fastify.post('/webhook', async (request, reply) => {
  logger.debug('📝 [DEBUG] Webhook Hit!');
  const signature = request.headers['x-hub-signature-256'] as string;
  const rawBody = request.rawBody as string;

  let appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.error('CRITICAL: WHATSAPP_APP_SECRET is undefined during webhook processing.');
    return reply.status(500).send('Internal Server Error');
  }
  let phoneId: string | undefined = undefined;

  try {
     const body = JSON.parse(rawBody);
     phoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

     if (phoneId) {
        const org = await getOrgByPhoneId(phoneId);
        if (org?.config?.appSecret) {
           logger.debug({ phoneId }, `🛡️ [DEBUG] Using Custom App Secret`);
           appSecret = org.config.appSecret;
        }
     }
  } catch (e) {
     logger.warn('Could not parse raw body for dynamic secret lookup');
  }

  if (!verifySignature(rawBody, signature, appSecret)) {
    logger.warn({ signature }, `❌ Invalid Webhook Signature!`);
    return reply.status(403).send('Invalid Signature');
  }

  const result = WhatsAppWebhookSchema.safeParse(request.body);
  if (!result.success) {
    logger.error({ err: result.error }, 'Invalid Webhook Payload');
    return reply.status(200).send('OK'); 
  }

  const entry = result.data.entry[0];
  const change = entry.changes[0];
  const value = change.value;

  if (!value.messages || value.messages.length === 0) {
    return reply.status(200).send('OK'); 
  }

  const message = value.messages[0];
  const businessPhoneId = value.metadata.phone_number_id;
  const from = message.from;

  const fromNormalized = parseAndFormatPhone(from) || from;
  const { findOrgByAdminPhone } = await import('@naija-agent/firebase');
  let org = await findOrgByAdminPhone(fromNormalized);
  
  if (!org) {
    org = await getOrgByPhoneId(businessPhoneId);
  }
  
  if (!org) {
    logger.warn({ businessPhoneId }, `Unknown Business Phone ID`);
    return reply.status(200).send('OK');
  }

  const processedKey = `processed:${org.id}:${message.id}`;
  const isProcessed = await redisConnection.exists(processedKey);
  if (isProcessed) {
    logger.info({ messageId: message.id, orgId: org.id }, `Duplicate message, skipping.`);
    return reply.status(200).send('OK');
  }

  await redisConnection.setex(processedKey, 3600, '1');

  const textBody = message.type === 'text' ? message.text?.body?.trim().toUpperCase() : '';
  
  if (textBody && ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END'].includes(textBody)) {
    logger.info({ from, orgId: org.id }, `🚫 User opted OUT.`);
    await setOptOut(org.id, from, true);
    return reply.status(200).send('OK');
  }

  if (textBody && ['START', 'SUBSCRIBE', 'UNSTOP'].includes(textBody)) {
    logger.info({ from, orgId: org.id }, `✅ User opted IN.`);
    await setOptOut(org.id, from, false);
    return reply.status(200).send('OK');
  }

  const isOptedOut = await checkOptOut(org.id, from);
  if (isOptedOut) {
    logger.info({ from }, `Skipping message from opted-out user`);
    return reply.status(200).send('OK');
  }

  const isAudioOrVoice = message.type === 'audio' || message.type === 'voice';
  const audioData = message.type === 'audio' ? message.audio : message.voice;

  const jobData: JobData = {
    type: isAudioOrVoice ? 'audio' : message.type === 'image' ? 'image' : (message.type === 'document' ? 'document' : 'text'),
    orgId: org.id,
    phoneId: businessPhoneId,
    from: from,
    name: value.contacts?.[0]?.profile?.name || 'Unknown',
    messageId: message.id,
    timestamp: Date.now(),
    content: {
      text: message.type === 'text' ? message.text?.body : undefined,
      audioId: isAudioOrVoice ? audioData?.id : undefined,
      imageId: message.type === 'image' ? message.image?.id : undefined,
      documentId: message.type === 'document' ? message.document?.id : undefined,
      fileName: message.type === 'document' ? message.document?.filename : undefined,
      caption: message.type === 'image' ? message.image?.caption : (message.type === 'document' ? message.document?.caption : undefined),
      mimeType: isAudioOrVoice ? audioData?.mime_type : (message.type === 'image' ? message.image?.mime_type : (message.type === 'document' ? message.document?.mime_type : undefined)),
    },
  };

  try {
    // --- DUAL IDENTITY ROUTING (VYNUX LAYER) ---
    // If the message came to the Life Bot Phone ID, route to Life Queue (Aelixxr)
    // Otherwise, route to Business Queue (Zynux)
    const isLifeBot = process.env.AELIXXR_PHONE_ID && businessPhoneId === process.env.AELIXXR_PHONE_ID;
    
    if (isLifeBot) {
        jobData.type = 'life-chat'; // Explicitly mark as Life Chat
        // For Life Queue, we might process 'text' type jobs differently than the main worker.
        // But passing the full jobData allows the Life Worker to decide.
        // NOTE: The Life Worker expects job.name 'life-chat' for chat interactions.
        // We map the incoming WhatsApp message to a 'life-chat' job.
        
        await lifeQueue.add('life-chat', {
            orgId: org.id, // Pass Org ID for billing
            userPhone: from,
            message: jobData.content.text || jobData.content.caption || '', 
            imageId: jobData.content.imageId,
            documentId: jobData.content.documentId,
            mimeType: jobData.content.mimeType
        }, {
            removeOnComplete: true,
            attempts: 3
        });
        logger.info({ from, target: 'AELIXXR' }, `🌿 Routed to Life Queue.`);
    } else {
        // Default: Business Logic (Zynux)
        await whatsappQueue.add('process-message', jobData, {
            removeOnComplete: true,
            removeOnFail: 100, 
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
        });
        logger.info({ from, target: 'ZYNUX' }, `💼 Routed to Business Queue.`);
    }

    return reply.status(200).send('OK');
  } catch (err: any) {
    logger.error({ from, error: err.message }, `🚨 [REDIS_FAIL] Failed to queue message`);
    return reply.status(503).send('Service Unavailable - Queue Error');
  }
});

// 4. Outbound Message (POST)
fastify.post('/send', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return reply.status(401).send('Unauthorized');
  }

  const schema = z.object({
    to: z.string(),
    text: z.string().optional(),
    templateName: z.string().optional(),
    languageCode: z.string().default('en_US'),
    phoneId: z.string().optional(), 
  });

  const result = schema.safeParse(request.body);
  if (!result.success) {
    return reply.status(400).send(result.error);
  }

  const { to, text, templateName, languageCode, phoneId } = result.data;
  
  if (!text && !templateName) {
    return reply.status(400).send('Either text or templateName is required');
  }

  const effectivePhoneId = phoneId || process.env.WHATSAPP_PHONE_ID;

  if (!effectivePhoneId) {
     return reply.status(400).send('phoneId is required');
  }

  const jobData: JobData = {
    type: templateName ? 'template' : 'text',
    phoneId: effectivePhoneId,
    orgId: 'system', 
    from: to, 
    messageId: `OUT-${Date.now()}`,
    timestamp: Date.now(),
    content: {
      text,
      templateName,
      languageCode,
    },
  };

  await whatsappQueue.add(templateName ? 'send-template' : 'process-message', jobData, {
    removeOnComplete: true,
  });

  return { success: true, jobId: jobData.timestamp };
});

// 5. Legacy SMS Bridge (Isolated)
fastify.register(legacyBridgeRoutes, { whatsappQueue, redisConnection, logger });

// 7. Proactive Cron (GET)
fastify.get('/cron/daily-reports', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  
  if (cronSecret !== process.env.CRON_SECRET) {
    logger.warn('❌ Unauthorized CRON attempt!');
    return reply.status(401).send('Unauthorized');
  }

  const orgs = await getActiveOrganizations();
  logger.info({ count: orgs.length }, `📡 [CRON] Triggering daily reports.`);

  for (const org of orgs) {
    if (!org.config?.adminPhone) continue;
    if (org.id === 'naija-agent-master') continue;

    await whatsappQueue.add('daily-report', 
      { 
        orgId: org.id,
        from: org.config.adminPhone,
        type: 'text',
        timestamp: Date.now(),
        messageId: `cron_api_${Date.now()}`,
        content: {}
      }, 
      { removeOnComplete: true }
    );
  }

  if (process.env.MASTER_ADMIN_PHONE) {
      await whatsappQueue.add('master-report', {}, { removeOnComplete: true });
  }

  return reply.send({ status: 'success', triggered: orgs.length });
});

fastify.get('/cron/cart-recovery', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

  const recoveryJob: JobData = {
    type: 'text', orgId: 'system', phoneId: '', from: 'system',
    messageId: `REC-${Date.now()}`, timestamp: Date.now(), content: {}
  };

  await whatsappQueue.add('hourly-cart-recovery', recoveryJob, { removeOnComplete: true });
  logger.info('📡 [CRON] Triggered hourly cart recovery.');
  return reply.send({ status: 'success' });
});

fastify.get('/cron/reminders', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

  const jobData: JobData = {
    type: 'text', orgId: 'system', phoneId: '', from: 'system',
    messageId: `REM-${Date.now()}`, timestamp: Date.now(), content: {}
  };

  await whatsappQueue.add('hourly-reminder-scan', jobData, { removeOnComplete: true });
  logger.info('📡 [CRON] Triggered hourly appointment reminder scan.');
  return reply.send({ status: 'success' });
});

fastify.get('/cron/inventory-alerts', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

  const jobData: JobData = {
    type: 'text', orgId: 'system', phoneId: '', from: 'system',
    messageId: `INV-${Date.now()}`, timestamp: Date.now(), content: {}
  };

  await whatsappQueue.add('hourly-inventory-cleanup', jobData, { removeOnComplete: true });
  logger.info('📡 [CRON] Triggered hourly inventory cleanup/alert.');
  return reply.send({ status: 'success' });
});

fastify.get('/cron/life-heartbeat', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

  const jobData: any = {
    type: 'system',
    timestamp: Date.now()
  };

  await lifeQueue.add('life-heartbeat', jobData, { removeOnComplete: true });
  logger.info('📡 [CRON] Triggered Aelixxr life-heartbeat scan.');
  return reply.send({ status: 'success' });
});

// 7b. CRON: Release Abandoned Cart Locks (Ghost Locks)
fastify.get('/cron/release-abandoned-locks', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

  try {
    logger.info("🕒 Running Ghost Lock Cleanup CRON...");
    const { getExpiredCarts, clearCart } = await import('@naija-agent/firebase');
    
    // Fetch carts abandoned for more than 2 hours (120 mins)
    const abandonedCarts = await getExpiredCarts(120); 

    let releasedCount = 0;
    for (const cart of abandonedCarts) {
      await clearCart(cart.orgId, cart.userPhone);
      logger.info({ orgId: cart.orgId, phone: cart.userPhone }, "✅ Released abandoned cart locks.");
      releasedCount++;
    }

    return reply.send({ status: 'success', message: `Released ${releasedCount} abandoned carts.` });
  } catch (error: any) {
    logger.error({ error: error.message }, "❌ Failed to run Ghost Lock Cleanup");
    return reply.status(500).send({ error: 'Failed to release locks' });
  }
});

// 8. Agent Discovery (GET)
fastify.get('/network/search', async (request, reply) => {
  const query = request.query as { sector?: string; capability?: string };
  const { sector, capability } = query;

  if (!sector) {
    return reply.status(400).send({ error: 'Sector is required' });
  }

  const db = getDb();
  let firestoreQuery = db.collection('organizations')
    .where('sector', '==', sector)
    .where('isActive', '==', true)
    .limit(20);

  if (capability) {
    firestoreQuery = firestoreQuery.where('capabilities', 'array-contains', capability);
  }

  const snapshot = await firestoreQuery.get();
  
  const agents = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      phoneId: data.whatsappPhoneId, // Return Phone ID so other agents can message them
      sector: data.sector,
      description: data.description || 'No description available.',
      capabilities: data.capabilities || []
    };
  });

  return { status: 'success', count: agents.length, agents };
});

// Start Server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });
    logger.info({ port }, '🚀 [API] Server Listening');
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to start API server');
    process.exit(1);
  }
};

start();
