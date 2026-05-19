import { v2 as cloudinary } from 'cloudinary';
import { getStorage } from 'firebase-admin/storage';
import { AlibabaOSSProvider } from './providers/alibaba.js';
import { StorageProvider } from './interfaces.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Strategy Selector: Prioritize Alibaba OSS for Sovereign Stack, 
 * fallback to Cloudinary for free tier, and finally Firebase.
 */
let activeProvider: StorageProvider | null = null;

if (process.env.ALIBABA_OSS_ACCESS_KEY_ID) {
  activeProvider = new AlibabaOSSProvider({
    region: process.env.ALIBABA_OSS_REGION || 'oss-ap-southeast-1',
    accessKeyId: process.env.ALIBABA_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.ALIBABA_OSS_BUCKET || 'naija-agent-media',
    endpoint: process.env.ALIBABA_OSS_ENDPOINT
  });
}

export async function uploadMedia(
  orgId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  // 1. Sovereign Priority (Alibaba OSS)
  if (activeProvider) {
    try {
       return await activeProvider.upload(orgId, fileName, buffer, mimeType, metadata);
    } catch (e: any) {
       console.error('⚠️ [ALIBABA OSS] Upload failed, falling back:', e.message);
    }
  }

  // 2. High-Volume Fallback (Cloudinary)
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config(process.env.CLOUDINARY_URL);
    try {
      return await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `naija-agent/orgs/${orgId}`,
            public_id: fileName.split('.')[0],
            resource_type: 'auto',
            context: metadata,
            tags: [orgId, 'naija-agent']
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result?.secure_url || '');
          }
        );
        uploadStream.end(buffer);
      });
    } catch (e: any) {
      console.error('❌ [CLOUDINARY] Upload error:', e.message);
    }
  }

  // 3. Infrastructure Fallback (Firebase)
  return uploadToFirebase(orgId, fileName, buffer, mimeType, metadata);
}

async function uploadToFirebase(
  orgId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  const bucket = getStorage().bucket();
  const path = `orgs/${orgId}/media/${fileName}`;
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: {
        ...metadata,
        orgId,
        uploadedAt: new Date().toISOString()
      }
    },
    public: true 
  });

  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

export async function getSignedMediaUrl(path: string): Promise<string> {
  if (activeProvider && !path.includes('googleapis.com')) {
    return activeProvider.getSignedUrl(path);
  }
  
  const bucket = getStorage().bucket();
  const file = bucket.file(path);
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, 
  });
  return url;
}
