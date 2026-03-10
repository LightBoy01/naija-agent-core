import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
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

async function scheduleReports() {
  console.log('📡 [SCHEDULER] Fetching active organizations...');
  const orgs = await getActiveOrganizations();
  console.log(`📡 [SCHEDULER] Found ${orgs.length} orgs.`);

  for (const org of orgs) {
    if (!org.config?.adminPhone) {
      console.warn(`⚠️ [SCHEDULER] Skipping ${org.id} - No admin phone.`);
      continue;
    }

    const jobId = `daily-report:${org.id}`;

    // Check if it already exists to avoid duplicates
    const repeatableJobs = await whatsappQueue.getRepeatableJobs();
    const existing = repeatableJobs.find(j => j.id === jobId);

    if (existing) {
      console.log(`⏭️ [SCHEDULER] ${org.id} already scheduled at ${existing.cron}`);
      continue;
    }

    // Schedule for 8:00 AM (Lagos Time)
    // BullMQ uses cron syntax: 'm h d m dw'
    // '0 7 * * *' is 7 AM UTC, which is 8 AM Lagos.
    const cron = '0 7 * * *'; 

    await whatsappQueue.add('daily-report', 
      { 
        orgId: org.id,
        from: org.config.adminPhone,
        type: 'text',
        timestamp: Date.now(),
        messageId: `cron_${Date.now()}`,
        content: {}
      }, 
      { 
        repeat: { cron },
        jobId: jobId, // Custom job ID for easier tracking/removal
        removeOnComplete: true,
      }
    );

    console.log(`✅ [SCHEDULER] Scheduled 8:00 AM report for ${org.name} (${org.id})`);

    // --- Phase 5.5: Bridge Health Guardian ---
    const healthJobId = `health-check:${org.id}`;
    const healthExisting = repeatableJobs.find(j => j.id === healthJobId);
    
    if (!healthExisting) {
       await whatsappQueue.add('check-bridge-health', 
        { orgId: org.id },
        { 
          repeat: { cron: '*/10 * * * *' }, // Every 10 minutes
          jobId: healthJobId,
          removeOnComplete: true,
        }
      );
      console.log(`✅ [SCHEDULER] Scheduled 10-minute health guardian for ${org.name}`);
    }

    // --- Phase 5.6: Proactive Nudges ---
    const reminderJobId = `reminder-scan:${org.id}`;
    const reminderExisting = repeatableJobs.find(j => j.id === reminderJobId);

    if (!reminderExisting) {
       await whatsappQueue.add('hourly-reminder-scan', 
        { orgId: org.id },
        { 
          repeat: { cron: '0 * * * *' }, // Every hour
          jobId: reminderJobId,
          removeOnComplete: true,
        }
      );
      console.log(`✅ [SCHEDULER] Scheduled hourly reminder scanner for ${org.name}`);
    }
  }

  console.log('🏁 [SCHEDULER] Done.');
  process.exit(0);
}

scheduleReports().catch(err => {
  console.error('❌ [SCHEDULER] Fatal error:', err);
  process.exit(1);
});
