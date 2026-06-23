import { FastifyInstance } from 'fastify';
import { getActiveOrganizations, syncCartState } from '@naija-agent/database';
import { JobData } from '@naija-agent/types';

export interface CronRouteOptions {
  whatsappQueue: any;
  lifeQueue: any;
  logger: any;
}

export default async function cronRoutes(fastify: FastifyInstance, opts: CronRouteOptions) {
  const { whatsappQueue, lifeQueue, logger } = opts;

  // 7. Proactive Cron (GET)
  fastify.get('/daily-reports', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    
    if (cronSecret !== process.env.CRON_SECRET) {
      logger.warn('❌ Unauthorized CRON attempt!');
      return reply.status(401).send('Unauthorized');
    }

    const orgs = await getActiveOrganizations();
    logger.info({ count: orgs.length }, `📡 [CRON] Triggering daily reports.`);

    for (const org of orgs) {
      if (!(org.config as any)?.adminPhone) continue;
      if (org.id === 'naija-agent-master') continue;

      await whatsappQueue.add('daily-report', 
        { 
          orgId: org.id,
          from: (org.config as any).adminPhone,
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

  fastify.get('/cart-recovery', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    const recoveryJob: JobData = {
      type: 'text', orgId: 'system', phoneId: '', from: 'system',
      messageId: `REC-${Date.now()}`, timestamp: Date.now(), content: {}
    };

    await whatsappQueue.add('hourly-cart-recovery', recoveryJob, { removeOnComplete: true });
    logger.info('📡 [CRON] Triggered hourly cart recovery.');
    return reply.send({ status: 'success' });
  });

  fastify.get('/reminders', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    const jobData: JobData = {
      type: 'text', orgId: 'system', phoneId: '', from: 'system',
      messageId: `REM-${Date.now()}`, timestamp: Date.now(), content: {}
    };

    await whatsappQueue.add('hourly-reminder-scan', jobData, { removeOnComplete: true });
    logger.info('📡 [CRON] Triggered hourly appointment reminder scan.');
    return reply.send({ status: 'success' });
  });

  fastify.get('/inventory-alerts', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    const jobData: JobData = {
      type: 'text', orgId: 'system', phoneId: '', from: 'system',
      messageId: `INV-${Date.now()}`, timestamp: Date.now(), content: {}
    };

    await whatsappQueue.add('hourly-inventory-cleanup', jobData, { removeOnComplete: true });
    logger.info('📡 [CRON] Triggered hourly inventory cleanup/alert.');
    return reply.send({ status: 'success' });
  });

  fastify.get('/life-heartbeat', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    const jobData: any = {
      type: 'system',
      timestamp: Date.now()
    };

    await lifeQueue.add('life-heartbeat', jobData, { removeOnComplete: true });
    logger.info('📡 [CRON] Triggered Aelixxr life-heartbeat scan.');
    return reply.send({ status: 'success' });
  });

  // 7c. CRON: Sovereign Cron Tick (Hermes Background Tasks)
  fastify.get('/sovereign-tick', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    const jobData: any = {
      type: 'system',
      timestamp: Date.now()
    };

    // Push to lifeQueue to let Aelixxr process the due cron jobs
    await lifeQueue.add('sovereign-cron-tick', jobData, { removeOnComplete: true });
    logger.info('📡 [CRON] Triggered Sovereign Cron Tick.');
    return reply.send({ status: 'success' });
  });

  fastify.get('/release-abandoned-locks', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    try {
      logger.info("🕒 Running Ghost Lock Cleanup CRON...");
      const { getExpiredCarts, clearCart } = await import('@naija-agent/firebase');
      
      // Fetch carts abandoned for more than 2 hours (120 mins)
      const abandonedCarts = await getExpiredCarts(120); 

      let releasedCount = 0;
      for (const cart of abandonedCarts) {
        await clearCart(cart.orgId, cart.userPhone);
        await syncCartState(`${cart.orgId}_${cart.userPhone}`, false);
        logger.info({ orgId: cart.orgId, phone: cart.userPhone }, "✅ Released abandoned cart locks.");
        releasedCount++;
      }

      return reply.send({ status: 'success', message: `Released ${releasedCount} abandoned carts.` });
    } catch (error: any) {
      logger.error({ error: error.message }, "❌ Failed to run Ghost Lock Cleanup");
      return reply.status(500).send({ error: 'Failed to release locks' });
    }
  });

  fastify.get('/referral-settlement', async (request, reply) => {
    const cronSecret = (request.headers as any)['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) return reply.status(401).send('Unauthorized');

    try {
      logger.info("🕒 Running Referral Settlement CRON...");
      const { processMatureReferrals } = await import('@naija-agent/database');
      
      const processed = await processMatureReferrals();

      for (const ref of processed) {
        const formattedBonus = '₦' + (ref.commissionEarnedKobo / 100).toLocaleString();
        const notificationMsg = `🎉 *REFERRAL BONUS UNLOCKED!*\n\nOga, that your ${formattedBonus} referral bonus has matured and is now in your Alajo Vault!\n\nYou can withdraw it to your bank or use it to buy airtime. Thank you for building the network.`;

        await whatsappQueue.add('process-message', {
          type: 'text',
          orgId: 'system',
          phoneId: process.env.WHATSAPP_PHONE_ID || 'PENDING',
          from: ref.referrerPhone,
          messageId: `REF-PAID-${Date.now()}-${ref.id}`,
          timestamp: Date.now(),
          content: { text: notificationMsg }
        }, { removeOnComplete: true });
        
        logger.info({ referrer: ref.referrerPhone, amount: ref.commissionEarnedKobo }, "✅ Paid out referral bonus.");
      }

      return reply.send({ status: 'success', message: `Settled ${processed.length} referrals.` });
    } catch (error: any) {
      logger.error({ error: error.message }, "❌ Failed to run Referral Settlement");
      return reply.status(500).send({ error: 'Failed to settle referrals' });
    }
  });
}
