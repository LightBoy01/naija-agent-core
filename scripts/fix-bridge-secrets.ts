import { getDb } from '../packages/firebase/src/index.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Queue } from 'bullmq';

dotenv.config();

const db = getDb();
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

async function fixBridgeSecrets() {
  const snapshot = await db.collection('organizations').get();
  console.log(`🔍 Checking ${snapshot.size} organizations...`);

  const whatsappQueue = new Queue('whatsapp-queue', { connection: redisConfig });

  for (const doc of snapshot.docs) {
    const data = doc.data();
    let updated = false;
    const config = data.config || {};

    // 1. Ensure Bridge Secret exists
    if (!config.bridgeSecret) {
      config.bridgeSecret = crypto.randomBytes(16).toString('hex');
      console.log(`✅ Generated secret for ${data.name}`);
      updated = true;
    }

    // 2. Ensure Proactive Toggle is on
    if (config.useSmsBridge === undefined) {
      config.useSmsBridge = true;
      updated = true;
    }

    if (updated) {
      await doc.ref.update({ config });
      
      // 3. Trigger Auto-Pulse for this existing tenant
      console.log(`📡 Re-scheduling pulse for ${data.name}...`);
      
      // Daily Report
      await whatsappQueue.add('daily-report', 
        { orgId: doc.id, from: config.adminPhone, type: 'text', timestamp: Date.now(), messageId: `mig_${Date.now()}`, content: {} }, 
        { repeat: { cron: '0 7 * * *' }, jobId: `daily-report:${doc.id}`, removeOnComplete: true }
      );

      // Health Guardian
      await whatsappQueue.add('check-bridge-health', 
        { orgId: doc.id },
        { repeat: { cron: '*/10 * * * *' }, jobId: `health-check:${doc.id}`, removeOnComplete: true }
      );

      // Appointment Nudges
      await whatsappQueue.add('hourly-reminder-scan', 
        { orgId: doc.id },
        { repeat: { cron: '0 * * * *' }, jobId: `reminder-scan:${doc.id}`, removeOnComplete: true }
      );
    }
  }

  console.log('🏁 Migration complete.');
  process.exit(0);
}

fixBridgeSecrets();
