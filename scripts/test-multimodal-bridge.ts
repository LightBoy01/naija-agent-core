import * as dotenv from 'dotenv';
import { ingestDocument } from '../packages/storage/src/index.ts';
import fs from 'fs';

dotenv.config();

// --- Termux Fix ---
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined && process.platform === 'android') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log('🛡️ [TERMUX FIX]: TLS Verification disabled to prevent fetch errors.');
}

async function testBridge() {
  console.log('☁️ --- TESTING CLOUDINARY MULTIMODAL BRIDGE --- ☁️');

  const testUserId = 'test-user-v2';
  const apiKey = process.env.GEMINI_API_KEY || '';
  
  // 1. Create a tiny fake image buffer for testing
  const fakeImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  const mimeType = 'image/png';

  console.log('📤 Attempting to vault a test file to Cloudinary...');

  try {
    const doc = await ingestDocument(testUserId, fakeImageBuffer, mimeType, apiKey, {
        orgId: 'naija-agent-master',
        caption: 'Test upload for Cloudinary Bridge'
    });

    console.log('\n✅ VAULTING SUCCESSFUL!');
    console.log(`📦 Provider: ${doc.provider}`);
    console.log(`🔗 Storage URL: ${doc.storageUrl}`);
    console.log(`🧠 AI Title: ${doc.title}`);
    console.log(`🧠 AI Summary: ${doc.summary}`);
    console.log(`🧬 Embedding Size: ${doc.embedding?.length || 0} dimensions`);

    if (doc.storageUrl?.includes('cloudinary')) {
        console.log('\n✨ CONFIRMED: Cloudinary Bridge is ACTIVE and providing storage.');
    } else {
        console.warn('\n⚠️ WARNING: System used GCS instead of Cloudinary. Check CLOUDINARY_URL in .env.');
    }

  } catch (error: any) {
    console.error('❌ Bridge Test FAILED:', error.message);
  }

  process.exit(0);
}

testBridge();
