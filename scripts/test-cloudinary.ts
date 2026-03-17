import dotenv from 'dotenv';
import { uploadMedia } from '../packages/storage/dist/index.js';
import { getDb } from '@naija-agent/firebase';
import fs from 'fs';

dotenv.config();

async function testCloudinary() {
  console.log('🖼️ --- STORAGE INTEGRATION TEST --- 🚀');
  
  // Ensure Firebase is initialized for fallback
  await getDb();
  
  if (!process.env.CLOUDINARY_URL) {
    console.warn('⚠️ CLOUDINARY_URL missing in .env. Will test Firebase Fallback.');
  } else {
    console.log('✅ Cloudinary URL found in environment.');
  }

  // Use a tiny 1x1 transparent PNG buffer
  const mockBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  const orgId = 'test-org-cloudinary';
  const fileName = `test-upload-${Date.now()}.png`;
  const mimeType = 'image/png';

  console.log(`📡 Uploading mock image to ${process.env.CLOUDINARY_URL ? 'Cloudinary' : 'Firebase'}...`);

  try {
    const url = await uploadMedia(orgId, fileName, mockBuffer, mimeType, { test: 'true' });
    
    console.log('\n✅ UPLOAD SUCCESS!');
    console.log(`🔗 URL: ${url}`);

    if (url.includes('cloudinary.com')) {
      console.log('✨ Verified: Storage is currently using CLOUDINARY (Scalable/Fast).');
    } else if (url.includes('storage.googleapis.com')) {
      console.log('📦 Verified: Storage is using FIREBASE FALLBACK (Reliable/Standard).');
    } else {
      console.warn('❓ Unknown storage provider URL format.');
    }

  } catch (err: any) {
    console.error(`❌ UPLOAD FAILED: ${err.message}`);
  }
}

testCloudinary().then(() => process.exit(0));
