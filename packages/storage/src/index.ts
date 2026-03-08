import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

/**
 * Uploads a buffer to Firebase Storage and returns the public URL.
 * Path: orgs/{orgId}/media/{fileName}
 */
export async function uploadMedia(
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
    public: true // For simple MVP, we make it public (or use signed URLs later)
  });

  // Return the public URL (Firebase standard format)
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/**
 * Generates a signed URL for private media (expires after 1 hour)
 */
export async function getSignedMediaUrl(path: string): Promise<string> {
  const bucket = getStorage().bucket();
  const file = bucket.file(path);

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  return url;
}
