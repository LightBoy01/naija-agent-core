import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import { getActiveOrganizations } from '../packages/firebase/src/index.js';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

const whatsappQueue = new Queue('whatsapp-queue', { connection: redisConfig });

async function reconcileSchedules() {
  console.log('📡 [RECONCILE] Starting schedule audit for all active organizations...');
  
  const orgs = await getActiveOrganizations();
  console.log(`📡 [RECONCILE] Found ${orgs.length} active organizations.`);

  const repeatableJobs = await whatsappQueue.getRepeatableJobs();
  console.log(`📡 [RECONCILE] Currently ${repeatableJobs.length} repeatable jobs in BullMQ.`);

  for (const org of orgs) {
    if (!org.config?.adminPhone) {
      console.warn(`⚠️ [RECONCILE] Skipping ${org.id} - No admin phone.`);
      continue;
    }

    const schedules = [
      {
        name: 'daily-report',
        id: `daily-report:${org.id}`,
        cron: '0 7 * * *', // 8 AM Lagos
        data: { 
          orgId: org.id, 
          from: org.config.adminPhone, 
          type: 'text', 
          timestamp: Date.now(), 
          messageId: `cron_${Date.now()}`, 
          content: {} 
        }
      },
      {
        name: 'check-bridge-health',
        id: `health-check:${org.id}`,
        cron: '*/10 * * * *', // Every 10 mins
        data: { orgId: org.id }
      },
      {
        name: 'hourly-reminder-scan',
        id: `reminder-scan:${org.id}`,
        cron: '0 * * * *', // Every hour
        data: { orgId: org.id }
      }
    ];

    for (const sched of schedules) {
      const existing = repeatableJobs.find(j => j.id === sched.id);
      
      if (!existing) {
        console.log(`➕ [RECONCILE] Missing ${sched.name} for ${org.name}. Scheduling...`);
        await whatsappQueue.add(sched.name, sched.data, {
          repeat: { cron: sched.cron },
          jobId: sched.id,
          removeOnComplete: true,
        });
      } else if (existing.cron !== sched.cron) {
        console.log(`🔄 [RECONCILE] Updating ${sched.name} for ${org.name} (Cron changed: ${existing.cron} -> ${sched.cron})`);
        // To update, we must remove and re-add
        await whatsappQueue.removeRepeatableByKey(existing.key);
        await whatsappQueue.add(sched.name, sched.data, {
          repeat: { cron: sched.cron },
          jobId: sched.id,
          removeOnComplete: true,
        });
      } else {
        // console.log(`✅ [RECONCILE] ${sched.name} for ${org.name} is OK.`);
      }
    }
  }

  // --- Global Schedulers ---
  const globalSchedules = [
    {
      name: 'hourly-cart-recovery',
      id: 'global:cart-recovery',
      cron: '0 * * * *',
      data: {}
    }
  ];

  for (const sched of globalSchedules) {
    const existing = repeatableJobs.find(j => j.id === sched.id);
    if (!existing) {
      console.log(`➕ [RECONCILE] Missing global ${sched.name}. Scheduling...`);
      await whatsappQueue.add(sched.name, sched.data, {
        repeat: { cron: sched.cron },
        jobId: sched.id,
        removeOnComplete: true,
      });
    }
  }

  console.log('🏁 [RECONCILE] Audit complete.');
  process.exit(0);
}

reconcileSchedules().catch(err => {
  console.error('❌ [RECONCILE] Fatal error:', err);
  process.exit(1);
});
