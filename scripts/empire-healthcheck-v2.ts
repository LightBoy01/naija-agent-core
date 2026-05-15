import { Redis } from 'ioredis';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { getDb } from '../packages/firebase/src/index.ts';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';

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

  // 1. Storage & Multimodal Check (Cloudinary + GCS Fallback)
  console.log('🔍 [1/6] Checking Multimodal Storage...');
  try {
    if (process.env.CLOUDINARY_URL) {
      cloudinary.config(process.env.CLOUDINARY_URL);
      const result = await cloudinary.api.ping();
      if (result.status === 'ok') {
        console.log('✅ Cloudinary (Primary Storage) is ONLINE.');
      } else {
        console.warn('⚠️ Cloudinary Ping returned unexpected status:', result.status);
      }
    } else {
      console.log('ℹ️ Cloudinary URL not set, skipping Cloudinary check.');
    }

    let credentials;
    const localKeyPath = './packages/firebase/serviceAccountKey.json';
    if (fs.existsSync(localKeyPath)) {
      credentials = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    }

    const storage = new Storage({
      projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core',
      ...(credentials ? { credentials } : {})
    });
    const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'naija-agent-core.firebasestorage.app';
    const bucket = storage.bucket(BUCKET_NAME);
    const [exists] = await bucket.exists();
    if (exists) {
      console.log(`✅ GCS Bucket [${BUCKET_NAME}] (Fallback) is ONLINE.`);
    } else {
      console.warn(`⚠️ GCS Bucket [${BUCKET_NAME}] NOT FOUND (Optional if using Cloudinary).`);
    }
  } catch (err: any) {
    console.error('❌ Storage Connection FAILED:', err.message);
  }

  // 2. AI & Embedding Model Check (Production Endpoint)
  console.log('\n🔍 [2/6] Checking AI Models (Global Publisher Endpoint)...');
  try {
    const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
    
    // Using production endpoint config
    const genAI = new GoogleGenAI({
      apiKey,
      httpOptions: { 
        baseUrl: 'https://aiplatform.googleapis.com', 
        apiVersion: 'v1/publishers/google' 
      }
    });
    
    // Test a small embedding to verify model access
    // Try text-embedding-004 as it is more stable across endpoints
    const result = await genAI.models.embedContent({
      model: 'models/text-embedding-004',
      contents: [{ parts: [{ text: 'Health check' }] }]
    });
    
    if (result.embeddings?.[0]?.values || result.embedding?.values) {
        console.log('✅ AI Embedding Model (Production) is ACCESSIBLE.');
    } else {
        console.warn('⚠️ AI Embedding Model returned no values.');
    }

    // Verify chat model connectivity
    const chat = genAI.chats.create({ model: 'models/gemini-3-flash-preview' });
    const response = await chat.sendMessage({ message: 'ping' });
    if (response.text) {
        console.log('✅ Gemini 3 Flash (Production) is RESPONDING.');
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
