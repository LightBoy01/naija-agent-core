import Fastify from 'fastify';
import fastifyRawBody from 'fastify-raw-body';
import dotenv from 'dotenv';

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
  checkOptOut 
} from '@naija-agent/firebase';

dotenv.config();

// Ensure required environment variables are present
if (!process.env.WHATSAPP_APP_SECRET) {
  console.error('CRITICAL: WHATSAPP_APP_SECRET is not defined in environment variables.');
  process.exit(1);
}

// [FORCE REDEPLOY] This comment is here to trigger a build so new ENV variables are picked up.
const fastify = Fastify({ logger: true });

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

  // Idempotency: Check if we processed this message_id
  const processedKey = `processed:${message.id}`;
  const isProcessed = await redisConnection.exists(processedKey);
  if (isProcessed) {
    fastify.log.info(`Duplicate message ${message.id}, skipping.`);
    return reply.status(200).send('OK');
  }

  // Mark as processed (Expire in 1 hour)
  await redisConnection.setex(processedKey, 3600, '1');

  // Tenant Lookup: Find Org by Phone ID
  const org = await getOrgByPhoneId(businessPhoneId);
  
  if (!org) {
    fastify.log.warn(`Unknown Business Phone ID: ${businessPhoneId}`);
    return reply.status(200).send('OK');
  }

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
    type: message.type === 'audio' ? 'audio' : message.type === 'image' ? 'image' : 'text',
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
      caption: message.type === 'image' ? message.image?.caption : undefined,
      mimeType: message.type === 'audio' ? message.audio?.mime_type : (message.type === 'image' ? message.image?.mime_type : undefined),
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
    templateName: z.string(),
    languageCode: z.string().default('en_US'),
    phoneId: z.string().optional(), // Optional, defaults to env or first org
  });

  const result = schema.safeParse(request.body);
  if (!result.success) {
    return reply.status(400).send(result.error);
  }

  const { to, templateName, languageCode, phoneId } = result.data;
  
  // Use provided phoneId or fallback to the one in env (if single tenant)
  // For multi-tenant, phoneId is mandatory
  const effectivePhoneId = phoneId || process.env.WHATSAPP_PHONE_ID;

  if (!effectivePhoneId) {
     return reply.status(400).send('phoneId is required');
  }

  const jobData: JobData = {
    type: 'template',
    phoneId: effectivePhoneId,
    from: to, // In outbound context, 'from' is the recipient
    timestamp: Date.now(),
    content: {
      templateName,
      languageCode,
    },
  };

  await whatsappQueue.add('send-template', jobData, {
    removeOnComplete: true,
  });

  return { success: true, jobId: jobData.timestamp };
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
