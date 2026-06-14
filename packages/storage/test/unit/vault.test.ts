import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestDocument } from '../../src/vault/index.js';

// Mock dependencies
vi.mock('../../src/upload.js', () => ({
  uploadMedia: vi.fn().mockResolvedValue('https://storage.provider/test.jpg')
}));

vi.mock('@naija-agent/firebase', () => ({
  getDb: vi.fn(() => ({
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(true)
  }))
}));

// Mock fetch for multimodal extraction
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify({ category: 'Receipt', title: 'Test Receipt', summary: 'Verification summary' }) }]
      }
    }]
  })
});

describe('Vault Ingestion Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should orchestrate the full ingestion lifecycle', async () => {
    const doc = await ingestDocument(
      '+2348000000000',
      Buffer.from('mock-image'),
      'image/jpeg',
      'test-api-key',
      { orgId: 'test-org', caption: 'Test image' }
    );

    const { uploadMedia } = await import('../../src/upload.js');
    expect(uploadMedia).toHaveBeenCalled();
    expect(doc.type).toBe('Receipt');
    expect(doc.storageUrl).toBe('https://storage.provider/test.jpg');
    expect(doc.userId).toBe('+2348000000000');
  });
});
