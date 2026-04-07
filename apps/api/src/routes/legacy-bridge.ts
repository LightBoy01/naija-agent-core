import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getOrgByBridgeSecret } from '@naija-agent/firebase';
import { JobData } from '@naija-agent/types';

export interface LegacyBridgeOptions {
  whatsappQueue: Queue;
  redisConnection: Redis;
  logger: any;
}

export default async function legacyBridgeRoutes(fastify: FastifyInstance, options: LegacyBridgeOptions) {
  const { whatsappQueue, redisConnection, logger } = options;

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

  // 5. SMS Bridge (POST) - ASYNC INGESTION
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

    // Generate deterministic ID for worker idempotency
    const rawIdSource = `${timestamp}_${from}_${body}`;
    const alertId = crypto.createHash('sha256').update(rawIdSource).digest('hex').substring(0, 16);

    // Construct SMS Bridge Job for Asynchronous Processing
    const bridgeJob: JobData = {
      type: 'text',
      orgId: org.id,
      phoneId: org.whatsappPhoneId,
      from: from, // SMS Sender
      messageId: alertId,
      timestamp: timestamp, // SMS Timestamp
      content: {
        text: body // SMS Body
      }
    };

    try {
      await whatsappQueue.add('process-bridge-sms', bridgeJob, {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });
      logger.info({ alertId, orgId: org.id }, `📡 [SMS BRIDGE] Queued alert for async processing.`);
      return { success: true, alertId, queued: true };
    } catch (err: any) {
      logger.error({ alertId, error: err.message }, `🚨 [REDIS_FAIL] Failed to queue SMS alert`);
      return reply.status(503).send('Queue Error');
    }
  });

  // 6. SMS Bridge Heartbeat (POST)
  fastify.post('/bridge/heartbeat', async (request, reply) => {
    const bridgeSecret = request.headers['x-bridge-secret'] as string;
    if (!bridgeSecret) return reply.status(401).send('Missing Bridge Secret');

    const org = await getCachedOrgBySecret(bridgeSecret);
    if (!org) return reply.status(403).send('Invalid Bridge Secret');

    const heartbeatKey = `bridge_heartbeat:${org.id}`;
    await redisConnection.set(heartbeatKey, Date.now().toString());

    logger.info({ orgId: org.id }, `💓 [HEARTBEAT] Bridge is alive.`);
    return { success: true };
  });
}
