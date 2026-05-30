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
  getOrgById,
  getActiveOrganizations,
  getOrgDailyStats,
  getOrgByBridgeSecret,
  getNetworkStats,
  getOrganizationsBySector
} from '@naija-agent/database';
import { 
  topupOrg as topupOrgSql, 
  getDb as getSqlDb,
  syncCartState 
} from '@naija-agent/database';
import { getProvider } from '@naija-agent/payments';
import { formatCurrency } from './utils/currency.js';
import legacyBridgeRoutes from './routes/legacy-bridge.js';
import cronRoutes from './routes/crons.js';
import webhookRoutes from './routes/webhooks.js';
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

fastify.register(webhookRoutes, { whatsappQueue, lifeQueue, redisConnection, logger });

// 5. Legacy SMS Bridge (Isolated)
fastify.register(legacyBridgeRoutes, { whatsappQueue, redisConnection, logger });

// 7. Proactive Cron (GET)
fastify.register(cronRoutes, { prefix: '/cron', whatsappQueue, lifeQueue, logger });

// 8. Agent Discovery (GET)
fastify.get('/network/search', async (request, reply) => {
  const query = request.query as { sector?: string; capability?: string };
  const { sector, capability } = query;

  if (!sector) {
    return reply.status(400).send({ error: 'Sector is required' });
  }

  const orgs = await getOrganizationsBySector(sector, capability);
  
  const agents = orgs.map(org => {
    return {
      id: org.id,
      name: org.name,
      phoneId: org.whatsappPhoneId,
      sector: org.sector,
      description: (org.config as any)?.description || 'No description available.',
      capabilities: (org.config as any)?.capabilities || []
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
