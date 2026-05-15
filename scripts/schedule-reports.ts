import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { getActiveOrganizations, getDb } from '../packages/firebase/src/index.js';

dotenv.config();

// --- Robust Redis Connection ---
const redisUrl = process.env.REDIS_URL_LOS || process.env.REDIS_URL;
let redisClient: Redis;

if (redisUrl) {
    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
    });
} else {
    // Fallback to local
    redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
    });
}

const whatsappQueue = new Queue('whatsapp-queue', { connection: redisClient });
const lifeQueue = new Queue('life-queue', { connection: redisClient });

async function scheduleMasterJobs() {
  console.log('📡 [SCHEDULER] Fetching active organizations...');
  const orgs = await getActiveOrganizations();
  console.log(`📡 [SCHEDULER] Found ${orgs.length} orgs.`);

  for (const org of orgs) {
    if (!org.config?.adminPhone) {
      console.warn(`⚠️ [SCHEDULER] Skipping ${org.id} - No admin phone.`);
      continue;
    }

    const jobId = `daily-report:${org.id}`;

    const repeatableJobs = await whatsappQueue.getRepeatableJobs();
    const existing = repeatableJobs.find(j => j.id === jobId);

    if (existing) {
      console.log(`⏭️ [SCHEDULER] ${org.id} already scheduled at ${existing.cron}`);
    } else {
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
            jobId: jobId, 
            removeOnComplete: true,
        }
        );
        console.log(`✅ [SCHEDULER] Scheduled 8:00 AM report for ${org.name} (${org.id})`);
    }

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
}

async function scheduleLifeJobs() {
  console.log('💤 [SLEEP SCHEDULER] Fetching active life users...');
  
  const db = getDb();
  const snapshot = await db.collection('user_profiles').where('lastInteraction', '!=', null).get();
  
  console.log(`💤 [SLEEP SCHEDULER] Found ${snapshot.size} active users.`);

  const repeatableJobs = await lifeQueue.getRepeatableJobs();

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    const jobId = `sleep-cycle:${userId}`;

    const existing = repeatableJobs.find(j => j.id === jobId);

    if (existing) {
      console.log(`⏭️ [SLEEP SCHEDULER] ${userId} already scheduled at ${existing.cron}`);
      continue;
    }

    const cron = '*/30 * * * *'; 

    await lifeQueue.add('consolidate-memory', 
      { 
        userId: userId,
        orgId: 'naija-agent-master'
      }, 
      { 
        repeat: { cron },
        jobId: jobId,
        removeOnComplete: true,
      }
    );

    console.log(`✅ [SLEEP SCHEDULER] Scheduled 30-minute sleep cycle for user ${userId}`);
  }
}

async function run() {
    await scheduleMasterJobs();
    await scheduleLifeJobs();
    console.log('🏁 [SYSTEM SCHEDULER] All jobs configured successfully.');
    process.exit(0);
}

run().catch(err => {
  console.error('❌ [SYSTEM SCHEDULER] Fatal error:', err);
  process.exit(1);
});
