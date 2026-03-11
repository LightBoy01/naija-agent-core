import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
import { getActiveOrganizations, getNetworkStats, getDb } from '../packages/firebase/src/index.js';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

async function runHealthCheck() {
  console.log('\n🏥 --- NAIJA AGENT EMPIRE HEALTH CHECK (Phase 7) --- 🏥');
  console.log(`Timestamp: ${new Date().toLocaleString()}\n`);

  // 1. Redis Connection
  console.log('🔍 [1/5] Checking Redis & Staff Limits...');
  try {
    const redis = new Redis(redisConfig);
    await redis.ping();
    console.log('✅ Redis is ONLINE.');
    
    // Check for any active staff limits today
    const today = new Date().toISOString().split('T')[0];
    const staffKeys = await redis.keys(`limit:staff:*:*:${today}`);
    console.log(`📊 Active Staff Usage: ${staffKeys.length} staff members chatting today.`);
    
    redis.disconnect();
  } catch (err: any) {
    console.error('❌ Redis is OFFLINE:', err.message);
  }

  // 2. Global Cron Heartbeat
  console.log('\n🔍 [2/5] Checking Empire Pulse (Reports)...');
  try {
    const db = await getDb();
    const todayStr = new Date().toISOString().split('T')[0];
    const historyDoc = await db.collection('network_metadata').doc('global').collection('history').doc(todayStr).get();
    
    if (historyDoc.exists) {
       console.log('✅ Daily Network Snapshot has been captured for today.');
    } else {
       console.warn('⚠️  Daily Snapshot missing. Wait for the 8 AM Cron to run.');
    }
  } catch (err: any) {
    console.error('❌ Failed to check snapshots:', err.message);
  }

  // 3. Bridge Status
  console.log('\n🔍 [3/5] Checking SMS Bridge Status...');
  try {
    const redis = new Redis(redisConfig);
    const orgs = await getActiveOrganizations();
    let onlineBridges = 0;
    
    for (const org of orgs) {
       if (org.id === 'naija-agent-master') continue;
       const heartbeat = await redis.get(`bridge_heartbeat:${org.id}`);
       if (heartbeat) {
          const diffMinutes = (Date.now() - parseInt(heartbeat)) / (1000 * 60);
          if (diffMinutes <= 15) onlineBridges++;
       }
    }
    const tenantCount = orgs.filter(o => o.id !== 'naija-agent-master').length;
    console.log(`✅ ${onlineBridges}/${tenantCount} tenant bridges are ONLINE.`);
    redis.disconnect();
  } catch (err: any) {
    console.error('❌ Failed to check heartbeats:', err.message);
  }

  // 4. Financial Wisdom Check
  console.log('\n🔍 [4/5] Checking Multi-Tenant Financials...');
  try {
    const stats = await getNetworkStats('naija-agent-master');
    console.log(`🏦 Total Vault Balance: ₦${(stats.totalVaultKobo / 100).toLocaleString()}`);
    
    const trialGiftCount = stats.clients.filter((c: any) => c.balance === 100000).length;
    console.log(`🎁 New Leads: ${trialGiftCount} businesses currently on the ₦1,000 trial.`);

    const lowBalanceOrgs = stats.clients.filter((c: any) => (c.balance || 0) < 50000);
    if (lowBalanceOrgs.length > 0) {
       console.warn(`⚠️  ${lowBalanceOrgs.length} businesses have low balance (< ₦500.00).`);
    } else {
       console.log('✅ All active businesses have healthy balances.');
    }
  } catch (err: any) {
    console.error('❌ Failed to check financial health:', err.message);
  }

  // 5. Env Verification
  console.log('\n🔍 [5/5] Checking System Readiness...');
  const required = ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'WHATSAPP_API_TOKEN', 'MASTER_ADMIN_PHONE'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Critical Envs Missing: ${missing.join(', ')}`);
  } else {
    console.log('✅ All Empire Era environment variables are set.');
  }

  console.log('\n🏁 --- IMPACT CHECK COMPLETE --- 🏁');
  process.exit(0);
}

runHealthCheck().catch(err => {
  console.error('❌ Fatal error during health check:', err);
  process.exit(1);
});
