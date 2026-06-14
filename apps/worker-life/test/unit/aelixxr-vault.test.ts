import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaInterceptor } from '../../src/pipeline/interceptors/media.js';
import { LifePipelineContext } from '../../src/pipeline/types.js';

// Mock dependencies
vi.mock('../../src/services/whatsapp.js', () => ({
  whatsappService: {
    downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from('mock-media'), mimeType: 'image/jpeg' })
  }
}));

vi.mock('@naija-agent/storage', () => ({
  ingestDocument: vi.fn().mockResolvedValue({ summary: 'A receipt for groceries', type: 'Receipt' })
}));

vi.mock('../../src/services/lifeMemory.js', () => ({
  lifeMemory: {
    saveEpisodicEvent: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../src/utils/security.js', () => ({
  redactPII: vi.fn(text => text)
}));

describe('Aelixxr Media Ingestion Interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should download and ingest an image into the Vault', async () => {
    const mockCtx: Partial<LifePipelineContext> = {
      imageId: 'img-123',
      userPhone: '+2348000000000',
      orgId: 'test-org',
      apiKey: 'test-key',
      message: 'Save this receipt'
    };

    const result = await MediaInterceptor.execute(mockCtx as LifePipelineContext);

    const { whatsappService } = await import('../../src/services/whatsapp.js');
    const { ingestDocument } = await import('@naija-agent/storage');
    const { lifeMemory } = await import('../../src/services/lifeMemory.js');

    expect(whatsappService.downloadMedia).toHaveBeenCalledWith('img-123');
    expect(ingestDocument).toHaveBeenCalledWith(
      '+2348000000000',
      expect.any(Buffer),
      'image/jpeg',
      'test-key',
      expect.objectContaining({ originalMediaId: 'img-123' })
    );
    expect(result.ingestionSummary).toContain('A receipt for groceries');
    expect(lifeMemory.saveEpisodicEvent).toHaveBeenCalled();
  });

  it('should handle local file paths (Sovereign Sidecar optimization)', async () => {
    const mockCtx: Partial<LifePipelineContext> = {
      imageId: '/tmp/test.jpg',
      userPhone: '+2348000000000'
    };

    // Mock fs/promises
    vi.mock('fs/promises', () => ({
        readFile: vi.fn().mockResolvedValue(Buffer.from('local-data'))
    }));

    const result = await MediaInterceptor.execute(mockCtx as LifePipelineContext);

    expect(result.mediaBuffer?.toString()).toBe('local-data');
    expect(result.mediaMime).toBe('image/jpeg');
  });
});
