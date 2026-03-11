import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import dotenv from 'dotenv';
import pino from 'pino';

// Configure Structured Logging
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

console.log('🚀 [VERSION 1.0.2] API Service Starting...');
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import crypto from 'crypto';
import { z } from 'zod';
import { 
  WhatsAppWebhookSchema, 
  JobData, 
  WhatsAppMessage 
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

dotenv.config();

/**
 * Caches the Organization lookup by Bridge Secret in Redis for 1 hour
 * to save Firestore read costs on high-frequency heartbeats/SMS alerts.
 */
async function getCachedOrgBySecret(secret: string): Promise<any | null> {
  const cacheKey = `bridge_auth:${secret}`;
  const cached = await redisConnection.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }

  const org = await getOrgByBridgeSecret(secret);
  if (org) {
    await redisConnection.setex(cacheKey, 3600, JSON.stringify(org));
  }
  return org;
}

/**
 * Extracts amount from typical Nigerian bank SMS formats
 * e.g. "Amt: NGN 5,000.00", "Cr: 10,000", "Credit: 2,500.50"
 */
function extractAmountFromSMS(body: string): number | null {
  const cleanBody = body.replace(/,/g, ''); // Remove commas for easier matching
  const patterns = [
    /(?:Amt|Amount|Cr|Credit|Received|Value|Inflow)[:\s]+(?:NGN|N|#)?\s*([\d.]+)/i,
    /([\d.]+)\s*has\s*been\s*credited/i,
    /Acct:\s*\d+\s*Type:Cr\s*Amt:\s*([\d.]+)/i, // Specialized for Access/Zenith
    /Trans\s*Amt:\s*NGN\s*([\d.]+)/i, // Specialized for GTB
    /Inflow:\s*NGN\s*([\d.]+)/i, // Specialized for Kuda/OPay
    /successfully\s*credited\s*with\s*NGN\s*([\d.]+)/i
  ];

  for (const pattern of patterns) {
    const match = cleanBody.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (!isNaN(amount) && amount > 0) {
         return amount;
      }
    }
  }
  return null;
}

// Ensure required environment variables are present
if (!process.env.WHATSAPP_APP_SECRET) {
  console.error('CRITICAL: WHATSAPP_APP_SECRET is not defined in environment variables.');
  process.exit(1);
}

// [FORCE REDEPLOY] This comment is here to trigger a build so new ENV variables are picked up.
const fastify = Fastify({ 
  logger: logger
});

fastify.setErrorHandler((error, request, reply) => {
  console.error('🔥 [CRITICAL ERROR]:', error);
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
  console.log(`\n🔵 [INCOMING] ${request.method} ${request.url}`);
  console.log(`   Headers:`, JSON.stringify(request.headers, null, 2));
});

fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  if (body instanceof Buffer) {
    const bodyStr = body.toString('utf8');
    console.log('📦 [DEBUG] Raw Body Received:', bodyStr.substring(0, 100) + '...');
    (req as any).rawBody = bodyStr;
    try {
      const json = JSON.parse(bodyStr);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  } else {
    console.log('⚠️ [DEBUG] Body is not a Buffer!');
    done(null, undefined);
  }
});

// --- Redis & Queue Setup ---
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

const redisConnection = new Redis(redisConfig);

const whatsappQueue = new Queue('whatsapp-queue', { connection: redisConfig });

// --- Helpers ---

// Verify X-Hub-Signature-256
function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const calculated = 'sha256=' + hmac.update(payload).digest('hex');
  console.log('🛡️ [DEBUG] Signature Received:', signature);
  console.log('🛡️ [DEBUG] Signature Calculated:', calculated);
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
    console.warn('❌ Invalid Paystack Webhook Signature!');
    return reply.status(403).send('Invalid Signature');
  }

  const payload = request.body as any;
  if (payload.event !== 'charge.success') {
    return reply.status(200).send('Ignored');
  }

  const { reference, amount, metadata } = payload.data;
  const orgId = metadata?.orgId;

  if (!orgId) {
    console.warn(`⚠️ Received Paystack top-up without orgId metadata. Ref: ${reference}`);
    return reply.status(200).send('OK'); // Acknowledge anyway
  }

  try {
    const amountNaira = amount / 100; // Paystack sends amount in Kobo
    const result = await topupTenant(orgId, amountNaira, reference);

    if (result) {
      console.log(`✅ [PAYSTACK] Credited ₦${amountNaira.toLocaleString()} to ${orgId}`);
      
      // Notify Boss via WhatsApp
      const org = await getOrgById(orgId);
      if (org?.config?.adminPhone) {
        const notificationJob: JobData = {
          type: 'text',
          orgId: 'system',
          phoneId: org.whatsappPhoneId,
          from: org.config.adminPhone,
          timestamp: Date.now(),
          content: {
            text: `💳 *Top-up Successful!*\n\nOga, your account has been credited with *₦${amountNaira.toLocaleString()}* (Ref: ${reference}).\n\nYour new balance is *₦${(result.newBalance / 100).toLocaleString()}*.`
          }
        };
        await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
      }
    }
  } catch (e: any) {
    if (e.message === 'DUPLICATE_REFERENCE') {
      console.log(`⏭️ [PAYSTACK] Duplicate top-up ignored for Ref: ${reference}`);
    } else {
      console.error('❌ Paystack processing error:', e);
    }
  }

  return reply.status(200).send('OK');
});

// 3. Webhook Ingestion (POST)
fastify.post('/webhook', async (request, reply) => {
  console.log('📝 [DEBUG] Webhook Hit!');
  const signature = request.headers['x-hub-signature-256'] as string;
  const rawBody = request.rawBody as string;

  // Multi-Tenancy: Extract phoneId BEFORE verification to lookup secret
  let appSecret = process.env.WHATSAPP_APP_SECRET || '';
  let phoneId: string | undefined = undefined;

  try {
     const body = JSON.parse(rawBody);
     phoneId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

     if (phoneId) {
        const org = await getOrgByPhoneId(phoneId);
        if (org?.config?.appSecret) {
           console.log(`🛡️ [DEBUG] Using Custom App Secret for Phone ID: ${phoneId}`);
           appSecret = org.config.appSecret;
        }
     }
  } catch (e) {
     fastify.log.warn('Could not parse raw body for dynamic secret lookup');
  }

  // Security: Verify Signature using the dynamic secret
  if (!verifySignature(rawBody, signature, appSecret)) {
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    fastify.log.warn(`❌ Invalid Webhook Signature! Received: ${signature}, Expected: sha256=${expected}`);
    return reply.status(403).send('Invalid Signature');
  }

  // Parse Body (Already parsed by fastify if successful above, using request.body)
  const result = WhatsAppWebhookSchema.safeParse(request.body);
  if (!result.success) {
    fastify.log.error(result.error, 'Invalid Webhook Payload');
    return reply.status(200).send('OK'); // Return 200 to acknowledge anyway
  }

  const entry = result.data.entry[0];
  const change = entry.changes[0];
  const value = change.value;

  if (!value.messages || value.messages.length === 0) {
    return reply.status(200).send('OK'); // Status update, ignore
  }

  const message = value.messages[0];
  const businessPhoneId = value.metadata.phone_number_id;
  const from = message.from;

  // Tenant Lookup: Find Org by Phone ID
  const org = await getOrgByPhoneId(businessPhoneId);
  
  if (!org) {
    fastify.log.warn(`Unknown Business Phone ID: ${businessPhoneId}`);
    return reply.status(200).send('OK');
  }

  // Idempotency: Check if we processed this message_id for this tenant
  const processedKey = `processed:${org.id}:${message.id}`;
  const isProcessed = await redisConnection.exists(processedKey);
  if (isProcessed) {
    fastify.log.info(`Duplicate message ${message.id} for org ${org.id}, skipping.`);
    return reply.status(200).send('OK');
  }

  // Mark as processed (Expire in 1 hour)
  await redisConnection.setex(processedKey, 3600, '1');

  // --- Phase 4b: Compliance (Opt-In/Opt-Out) ---
  const textBody = message.type === 'text' ? message.text?.body?.trim().toUpperCase() : '';
  
  // 1. Check for STOP Commands
  if (textBody && ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END'].includes(textBody)) {
    console.log(`🚫 User ${from} opted OUT.`);
    await setOptOut(org.id, from, true);
    // Ideally queue a confirmation message here: "You have been unsubscribed."
    return reply.status(200).send('OK');
  }

  // 2. Check for START Commands
  if (textBody && ['START', 'SUBSCRIBE', 'UNSTOP'].includes(textBody)) {
    console.log(`✅ User ${from} opted IN.`);
    await setOptOut(org.id, from, false);
    // Ideally queue a confirmation message here: "Welcome back!"
    return reply.status(200).send('OK');
  }

  // 3. Check Status (The Gatekeeper)
  const isOptedOut = await checkOptOut(org.id, from);
  if (isOptedOut) {
    console.log(`Skipping message from opted-out user ${from}`);
    return reply.status(200).send('OK');
  }

  // Construct Job Data
  const jobData: JobData = {
    type: message.type === 'audio' ? 'audio' : message.type === 'image' ? 'image' : (message.type === 'document' ? 'document' : 'text'),
    orgId: org.id,
    phoneId: businessPhoneId,
    from: from,
    name: value.contacts?.[0]?.profile.name || 'Unknown',
    messageId: message.id,
    timestamp: Date.now(),
    content: {
      text: message.type === 'text' ? message.text?.body : undefined,
      audioId: message.type === 'audio' ? message.audio?.id : undefined,
      imageId: message.type === 'image' ? message.image?.id : undefined,
      documentId: message.type === 'document' ? message.document?.id : undefined,
      fileName: message.type === 'document' ? message.document?.filename : undefined,
      caption: message.type === 'image' ? message.image?.caption : (message.type === 'document' ? message.document?.caption : undefined),
      mimeType: message.type === 'audio' ? message.audio?.mime_type : (message.type === 'image' ? message.image?.mime_type : (message.type === 'document' ? message.document?.mime_type : undefined)),
    },
  };

  // Push to Queue
  await whatsappQueue.add('process-message', jobData, {
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 1000, // 1s, 2s, 4s
    },
  });

  fastify.log.info(`Queued job for ${from}`);
  return reply.status(200).send('OK');
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
    phoneId: z.string().optional(), // Optional, defaults to env or first org
  });

  const result = schema.safeParse(request.body);
  if (!result.success) {
    return reply.status(400).send(result.error);
  }

  const { to, text, templateName, languageCode, phoneId } = result.data;
  
  if (!text && !templateName) {
    return reply.status(400).send('Either text or templateName is required');
  }

  // Use provided phoneId or fallback to the one in env (if single tenant)
  const effectivePhoneId = phoneId || process.env.WHATSAPP_PHONE_ID;

  if (!effectivePhoneId) {
     return reply.status(400).send('phoneId is required');
  }

  const jobData: JobData = {
    type: templateName ? 'template' : 'text',
    phoneId: effectivePhoneId,
    orgId: 'system', // System job
    from: to, // In outbound context, 'from' is the recipient
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

// 5. SMS Bridge (POST) - AUTO-MATCHING ENGINE
fastify.post('/bridge/sms', async (request, reply) => {
  const bridgeSecret = request.headers['x-bridge-secret'] as string;
  if (!bridgeSecret) return reply.status(401).send('Missing Bridge Secret');

  const org = await getCachedOrgBySecret(bridgeSecret);
  if (!org) return reply.status(403).send('Invalid Bridge Secret');

  const schema = z.object({
    from: z.string(),
    body: z.string(),
    timestamp: z.number(),
  });

  const result = schema.safeParse(request.body);
  if (!result.success) {
    return reply.status(400).send(result.error);
  }

  const { from, body, timestamp } = result.data;
  const phoneId = org.whatsappPhoneId;

  // Idempotency: Check if this SMS was already processed
  const alertId = `sms_${timestamp}_${from.substring(0, 5)}`;
  const db = (await import('@naija-agent/firebase')).getDb();
  const alertDoc = await db.collection('organizations').doc(org.id).collection('sms_alerts').doc(alertId).get();
  
  if (alertDoc.exists) {
    console.log(`⏭️ [SMS BRIDGE] Already processed alert ${alertId}. Skipping.`);
    return { success: true, alertId, note: 'already_processed' };
  }

  // Log the SMS as a confirmed alert signal
  await db.collection('organizations').doc(org.id).collection('sms_alerts').doc(alertId).set({
    from,
    body,
    timestamp: new Date(timestamp),
    receivedAt: new Date(),
  });

  // --- Matching Logic ---
  let amount = extractAmountFromSMS(body);
  
  // 🎯 LLM FALLBACK: If regex fails, use Gemini to parse the bank SMS
  if (amount === null && process.env.GEMINI_API_KEY) {
     console.log(`🔍 [SMS BRIDGE] Regex failed for ${org.id}. Calling Gemini...`);
     try {
       const genAI = new (await import('@google/generative-ai')).GoogleGenerativeAI(process.env.GEMINI_API_KEY);
       const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });       const prompt = `Extract the transaction amount as a number only from this Nigerian bank SMS. 
       If no amount is found, return "NULL". 
       SMS: "${body}"`;
       
       const aiResult = await model.generateContent(prompt);
       const aiText = aiResult.response.text().trim();
       if (aiText !== "NULL") {
          const parsed = parseFloat(aiText.replace(/[^0-9.]/g, ''));
          if (!isNaN(parsed)) {
             amount = parsed;
             console.log(`✅ [SMS BRIDGE] Gemini extracted ₦${amount} for ${org.id}`);
          }
       }
     } catch (e: any) {
        console.error(`❌ [SMS BRIDGE] Gemini fallback failed:`, e.message);
     }
  }

  if (amount !== null) {
    const { findPendingTransaction, confirmTransaction, topupTenant } = await import('@naija-agent/firebase');

    // --- REFILL CHECK: Does the SMS body contain the Sovereign's Account Number? ---
    const sovereignAccount = org.config?.sovereignBankDetails?.accountNumber;
    const isRefill = sovereignAccount && body.includes(sovereignAccount);

    if (isRefill) {
       console.log(`💳 [REFILL MATCH] SMS ${alertId} linked to Sovereign account. Crediting Org ${org.id}`);
       const result = await topupTenant(org.id, amount, alertId);
       
       if (result && org.config?.adminPhone) {
          // Notify Boss via Master Bot (System job)
          const notificationJob: JobData = {
            type: 'text',
            orgId: 'system',
            phoneId: org.whatsappPhoneId,
            from: org.config.adminPhone,
            timestamp: Date.now(),
            content: {
              text: `✅ *AI Credit Refill Confirmed (SMS Bridge)*\n\nOga, your payment of *₦${amount.toLocaleString()}* has been received via bank alert.\n\nYour bot has been credited! New balance: *₦${(result.newBalance / 100).toLocaleString()}*.`
            }
          };
          await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
       }
    } else {
       // --- STANDARD SALE MATCHING ---
       const pendingTx = await findPendingTransaction(org.id, amount);
       if (pendingTx) {
         console.log(`✅ [SALE MATCH] Linking SMS ${alertId} to Tx ${pendingTx.id}`);
         await confirmTransaction(pendingTx.id, alertId);

         // Notify Customer via WhatsApp
         const notificationJob: JobData = {
           type: 'text',
           orgId: org.id,
           phoneId: phoneId,
           from: pendingTx.from,
           timestamp: Date.now(),
           content: {
             text: `✅ *Payment Confirmed!*\n\nWe have received your payment of *₦${amount.toLocaleString()}*. Your order is now being processed. Thank you!`
           }
         };
         await whatsappQueue.add('process-message', notificationJob, { removeOnComplete: true });
       }
    }
  }

  return { success: true, alertId };
});

// 6. SMS Bridge Heartbeat (POST)
fastify.post('/bridge/heartbeat', async (request, reply) => {
  const bridgeSecret = request.headers['x-bridge-secret'] as string;
  if (!bridgeSecret) return reply.status(401).send('Missing Bridge Secret');

  const org = await getCachedOrgBySecret(bridgeSecret);
  if (!org) return reply.status(403).send('Invalid Bridge Secret');

  // Store heartbeat in Redis (Expire in 24h)
  const heartbeatKey = `bridge_heartbeat:${org.id}`;
  await redisConnection.set(heartbeatKey, Date.now().toString());

  console.log(`💓 [HEARTBEAT] Bridge for ${org.name} is alive.`);
  return { success: true };
});

// 4. Proactive Cron (GET) - Triggered by Railway Scheduler
fastify.get('/cron/daily-reports', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn('❌ Unauthorized CRON attempt!');
    return reply.status(401).send('Unauthorized');
  }

  // 🛡️ [PHASE 5.20]: Stability Refactor
  // Instead of doing the work in the API, we just trigger the per-org worker jobs.
  const orgs = await getActiveOrganizations();
  console.log(`📡 [CRON] Triggering morning pulse for ${orgs.length} orgs.`);

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

  // --- SOVEREIGN EMPIRE REPORT (PHASE 5.19) ---
  if (process.env.MASTER_ADMIN_PHONE) {
      // For the Master report, we'll keep it simple in the API or move it to a special worker job.
      // Since it's global stats, we'll just queue a 'master-report' and let the worker fetch them.
      await whatsappQueue.add('master-report', {}, { removeOnComplete: true });
  }

  return reply.send({ status: 'success', triggered: orgs.length });
});

// 5. Cart Recovery Cron (GET)
fastify.get('/cron/cart-recovery', async (request, reply) => {
  const cronSecret = request.headers['x-cron-secret'];
  
  if (cronSecret !== process.env.CRON_SECRET) {
    console.warn('❌ Unauthorized CRON attempt!');
    return reply.status(401).send('Unauthorized');
  }

  const recoveryJob: JobData = {
    type: 'text', // Dummy type
    orgId: 'system',
    phoneId: '',
    from: 'system',
    timestamp: Date.now(),
    content: {}
  };

  await whatsappQueue.add('hourly-cart-recovery', recoveryJob, { removeOnComplete: true });
  console.log('📡 [CRON] Triggered hourly cart recovery job.');
  
  return reply.send({ status: 'success' });
});

// Start Server
const start = async () => {
  try {
    await fastify.listen({ port: parseInt(process.env.PORT || '3000'), host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
