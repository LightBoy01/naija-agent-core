import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { getDb } from '../packages/firebase/src/index.ts';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

async function runEmpireHealthCheck() {
  console.log('\n🌟 --- NAIJA AGENT EMPIRE HEALTH CHECK V2 (Phase 9/Empire Era) --- 🌟');
  console.log(`Timestamp: ${new Date().toLocaleString()}\n`);
// 1. Storage & Multimodal Check (GCS)
console.log('🔍 [1/6] Checking Multimodal Storage (GCS)...');
try {
  let credentials;
  const localKeyPath = './packages/firebase/serviceAccountKey.json';

  if (fs.existsSync(localKeyPath)) {
    console.log('📄 Using local serviceAccountKey.json');
    credentials = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const cleanBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.replace(/[^A-Za-z0-9+/=]/g, '');
    const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');
    const sanitized = decoded.replace(/[\n\r]/g, '');
    try {
      credentials = JSON.parse(sanitized);
      console.log(`📡 Credential Project ID: ${credentials.project_id}`);
    } catch (parseErr: any) {
      console.error('❌ JSON Parse Error:', parseErr.message);
      console.log('Decoded start:', decoded.substring(0, 50));
      throw parseErr;
    }
  }

  const storage = new Storage({
    projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core',
    ...(credentials ? { credentials } : {})
  });
    const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'naija-agent-core.firebasestorage.app';
    const bucket = storage.bucket(BUCKET_NAME);
    const [exists] = await bucket.exists();
    if (exists) {
      console.log(`✅ GCS Bucket [${BUCKET_NAME}] is ONLINE.`);
    } else {
      console.error(`❌ GCS Bucket [${BUCKET_NAME}] NOT FOUND.`);
      // Attempt to list buckets to see what's available
      const [buckets] = await storage.getBuckets();
      console.log('📝 Available Buckets:', buckets.map(b => b.name).join(', '));
    }
  } catch (err: any) {
    console.error('❌ GCS Connection FAILED:', err.message);
  }

  // 2. AI & Embedding Model Check
  console.log('\n🔍 [2/6] Checking AI Models (Gemini Embedding 2)...');
  try {
    const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
    
    // Try standard endpoint first
    const genAI = new GoogleGenAI(apiKey);
    
    // Test a small embedding to verify model access
    const result = await genAI.models.embedContent({
      model: 'models/gemini-embedding-2-preview',
      contents: [{ parts: [{ text: 'Health check' }] }]
    });
    
    if (result.embeddings?.[0]?.values) {
        console.log('✅ Gemini Embedding 2 (Multimodal) is ACCESSIBLE.');
    } else {
        console.warn('⚠️ Gemini Embedding 2 returned no values.');
    }
  } catch (err: any) {
    console.error('❌ AI Model Check FAILED:', err.message);
  }

  // 3. Life Operating System (LOS) Presence
  console.log('\n🔍 [3/6] Checking LOS (Life Operating System) Presence...');
  try {
    const db = await getDb();
    const profiles = await db.collection('user_profiles').limit(1).get();
    console.log(`✅ User Profiles collection is active (${profiles.size} sample found).`);
    
    const vaultDocs = await db.collectionGroup('docs').limit(1).get();
    console.log(`✅ Multimodal Vault Index is active (${vaultDocs.size} documents indexed).`);
  } catch (err: any) {
    console.error('❌ LOS Firestore Check FAILED:', err.message);
  }

  // 4. Redis Queue (LOS & BOS)
  console.log('\n🔍 [4/6] Checking Redis Queues (LOS & BOS)...');
  try {
    const redis = new Redis(redisConfig);
    await redis.ping();
    console.log('✅ Redis is ONLINE.');
    
    const lifeJobs = await redis.keys('bull:life-queue:*');
    const bosJobs = await redis.keys('bull:whatsapp-queue:*');
    
    console.log(`📊 LOS Queue Jobs: ${lifeJobs.length}`);
    console.log(`📊 BOS Queue Jobs: ${bosJobs.length}`);
    
    redis.disconnect();
  } catch (err: any) {
    console.error('❌ Redis Check FAILED:', err.message);
  }

  // 5. Sleep Cycle Schedule Check
  console.log('\n🔍 [5/6] Checking Sleep Cycle (Delayed Tasks)...');
  try {
    const redis = new Redis(redisConfig);
    const delayedJobs = await redis.zcard('bull:life-queue:delayed');
    console.log(`✅ Found ${delayedJobs} consolidation tasks waiting in 'Sleep' mode.`);
    redis.disconnect();
  } catch (err: any) {
    console.error('❌ Sleep Cycle Check FAILED:', err.message);
  }

  // 6. Env Readiness (Empire Era)
  console.log('\n🔍 [6/6] Checking System Readiness...');
  const required = [
    'GEMINI_API_KEY', 
    'FIREBASE_PROJECT_ID', 
    'FIREBASE_STORAGE_BUCKET',
    'WHATSAPP_API_TOKEN', 
    'MASTER_ADMIN_PHONE'
  ];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Critical Envs Missing: ${missing.join(', ')}`);
  } else {
    console.log('✅ All Phase 9 environment variables are set.');
  }

  console.log('\n🚀 --- EMPIRE HEALTH CHECK V2 COMPLETE --- 🚀');
  process.exit(0);
}

runEmpireHealthCheck().catch(err => {
  console.error('❌ Fatal error during health check:', err);
  process.exit(1);
});
