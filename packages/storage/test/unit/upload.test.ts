import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadMedia } from '../../src/upload.js';
import { StorageProvider } from '../../src/interfaces.js';

// Mock cloudinary
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn((options, callback) => {
        // Return a mock stream
        return {
          end: vi.fn(() => {
            callback(null, { secure_url: 'https://cloudinary.com/test.jpg' });
          })
        };
      })
    }
  }
}));

// Mock firebase-admin/storage
vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({
    bucket: vi.fn(() => ({
      name: 'test-bucket',
      file: vi.fn(() => ({
        save: vi.fn().mockResolvedValue(true)
      }))
    }))
  }))
}));

describe('Storage Upload Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear env vars to test fallbacks
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    delete process.env.TENCENT_COS_SECRET_ID;
    delete process.env.ALIBABA_OSS_ACCESS_KEY_ID;
  });

  it('should fallback to Cloudinary if CLOUDINARY_URL is set', async () => {
    process.env.CLOUDINARY_URL = 'cloudinary://test';

    const url = await uploadMedia('test-org', 'test.jpg', Buffer.from('data'), 'image/jpeg');

    expect(url).toBe('https://cloudinary.com/test.jpg');
    const { v2: cloudinary } = await import('cloudinary');
    expect(cloudinary.config).toHaveBeenCalledWith('cloudinary://test');
  });

  it('should fallback to Firebase if no other providers are set', async () => {
    delete process.env.CLOUDINARY_URL;

    const url = await uploadMedia('test-org', 'test.jpg', Buffer.from('data'), 'image/jpeg');

    expect(url).toContain('storage.googleapis.com');
    expect(url).toContain('test-org/media/test.jpg');
  });
});
