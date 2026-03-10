import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
import { getActiveOrganizations, getNetworkStats } from '../packages/firebase/src/index.js';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

async function runHealthCheck() {
  console.log('\n🏥 --- NAIJA AGENT MVP HEALTH CHECK --- 🏥');
  console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

  // 1. Redis Connection
  console.log('🔍 [1/5] Checking Redis...');
  try {
    const redis = new Redis(redisConfig);
    await redis.ping();
    console.log('✅ Redis is ONLINE.');
    redis.disconnect();
  } catch (err: any) {
    console.error('❌ Redis is OFFLINE:', err.message);
  }

  // 2. BullMQ Schedulers
  console.log('\n🔍 [2/5] Checking Proactive Pulses...');
  try {
    const whatsappQueue = new Queue('whatsapp-queue', { connection: redisConfig });
    const repeatableJobs = await whatsappQueue.getRepeatableJobs();
    const orgs = await getActiveOrganizations();
    
    let healthyOrgs = 0;
    for (const org of orgs) {
       const hasReport = repeatableJobs.some(j => j.id === `daily-report:${org.id}`);
       const hasHealth = repeatableJobs.some(j => j.id === `health-check:${org.id}`);
       const hasReminder = repeatableJobs.some(j => j.id === `reminder-scan:${org.id}`);
       
       if (hasReport && hasHealth && hasReminder) {
          healthyOrgs++;
       } else {
          console.warn(`⚠️  Org ${org.name} (${org.id}) is missing pulses: ${!hasReport ? 'Daily ' : ''}${!hasHealth ? 'Health ' : ''}${!hasReminder ? 'Reminder' : ''}`);
       }
    }
    console.log(`✅ ${healthyOrgs}/${orgs.length} organizations have full proactive pulses.`);
    await whatsappQueue.close();
  } catch (err: any) {
    console.error('❌ Failed to check BullMQ:', err.message);
  }

  // 3. Bridge Heartbeats
  console.log('\n🔍 [3/5] Checking SMS Bridge Status...');
  try {
    const redis = new Redis(redisConfig);
    const orgs = await getActiveOrganizations();
    let onlineBridges = 0;
    
    for (const org of orgs) {
       const heartbeat = await redis.get(`bridge_heartbeat:${org.id}`);
       if (heartbeat) {
          const diffMinutes = (Date.now() - parseInt(heartbeat)) / (1000 * 60);
          if (diffMinutes <= 15) onlineBridges++;
       }
    }
    console.log(`✅ ${onlineBridges}/${orgs.length} bridges have sent heartbeats in the last 15 minutes.`);
    redis.disconnect();
  } catch (err: any) {
    console.error('❌ Failed to check heartbeats:', err.message);
  }

  // 4. Financial Health (Low Balance Check)
  console.log('\n🔍 [4/5] Checking Financial Safety...');
  try {
    const stats = await getNetworkStats();
    console.log(`🏦 Total Vault Balance: ₦${(stats.totalVaultKobo / 100).toLocaleString()}`);
    
    const lowBalanceOrgs = stats.clients.filter((c: any) => (c.balance || 0) < 1000);
    if (lowBalanceOrgs.length > 0) {
       console.warn(`⚠️  ${lowBalanceOrgs.length} organizations have low balance (< ₦10.00).`);
       lowBalanceOrgs.forEach((c: any) => console.log(`   - ${c.name}: ₦${((c.balance || 0)/100).toLocaleString()}`));
    } else {
       console.log('✅ All active organizations have healthy balances.');
    }
  } catch (err: any) {
    console.error('❌ Failed to check financial health:', err.message);
  }

  // 5. Env Verification
  console.log('\n🔍 [5/5] Checking Environment Variables...');
  const required = [
    'GEMINI_API_KEY',
    'FIREBASE_PROJECT_ID',
    'REDIS_HOST',
    'WHATSAPP_API_TOKEN',
    'WHATSAPP_PHONE_ID'
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing critical variables: ${missing.join(', ')}`);
  } else {
    console.log('✅ All critical environment variables are set.');
  }

  console.log('\n🏁 --- HEALTH CHECK COMPLETE --- 🏁');
  process.exit(0);
}

runHealthCheck().catch(err => {
  console.error('❌ Fatal error during health check:', err);
  process.exit(1);
});
