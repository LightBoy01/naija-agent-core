import { v2 as cloudinary } from 'cloudinary';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function testCloudinaryDirect() {
  console.log('🧪 Direct Cloudinary Test...');
  
  const url = process.env.CLOUDINARY_URL;
  if (!url) {
    console.error('❌ CLOUDINARY_URL missing');
    return;
  }
  
  cloudinary.config({
    cloudinary_url: url,
    secure: true
  });

  console.log('Cloud Name:', cloudinary.config().cloud_name);

  // Tiny 1x1 pixel PNG
  const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

  return new Promise((resolve) => {
    console.log('📤 Starting upload stream...');
    const stream = cloudinary.uploader.upload_stream(
      { 
        folder: 'test',
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) {
          console.error('❌ Upload Error:', error);
          resolve(false);
        } else {
          console.log('✅ Upload Success:', result?.secure_url);
          resolve(true);
        }
      }
    );
    stream.end(buffer);
  });
}

testCloudinaryDirect().then(() => process.exit(0));
