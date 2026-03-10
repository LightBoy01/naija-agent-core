import { v2 as cloudinary } from 'cloudinary';
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

dotenv.config();

// --- Cloudinary Configuration (High Volume / Free Tier Scalable) ---
if (process.env.CLOUDINARY_URL) {
  cloudinary.config(process.env.CLOUDINARY_URL);
  console.log('🖼️ [STORAGE] Cloudinary Provider Enabled.');
} else {
  console.warn('⚠️ [STORAGE] Cloudinary not configured. Falling back to Firebase.');
}

/**
 * Uploads to Cloudinary (Scalable/Free) OR Firebase (Fallback)
 */
export async function uploadMedia(
  orgId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  // --- Strategy: Use Cloudinary if configured (Auto-optimization/Scalable) ---
  if (process.env.CLOUDINARY_URL) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `naija-agent/orgs/${orgId}`,
          public_id: fileName.split('.')[0],
          resource_type: 'auto',
          context: metadata,
          tags: [orgId, 'naija-agent']
        },
        (error, result) => {
          if (error) {
             console.error('❌ [CLOUDINARY] Upload error:', error.message);
             // Fallback to Firebase on error
             return resolve(uploadToFirebase(orgId, fileName, buffer, mimeType, metadata));
          }
          resolve(result?.secure_url || '');
        }
      );
      uploadStream.end(buffer);
    });
  }

  // --- Fallback: Firebase (Expensive at volume / Not auto-optimized) ---
  return uploadToFirebase(orgId, fileName, buffer, mimeType, metadata);
}

/**
 * Native Firebase Upload Logic
 */
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
  const bucket = getStorage().bucket();
  const file = bucket.file(path);

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, 
  });

  return url;
}
