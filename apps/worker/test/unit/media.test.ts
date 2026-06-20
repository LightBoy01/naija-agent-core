import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaInterceptor } from '../../src/pipeline/interceptors/media';
import fs from 'fs';
import * as storage from '@naija-agent/storage';

vi.mock('fs');
vi.mock('@naija-agent/storage', () => ({
  uploadMedia: vi.fn()
}));

describe('MediaInterceptor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should read from sidecar filesystem and upload to storage', async () => {
    const mockCtx = {
      job: {
        data: {
          type: 'image',
          content: { fileName: '/tmp/test.jpg', mimeType: 'image/jpeg' },
          orgId: 'org1',
          from: '1234',
          phoneId: 'baileys-123'
        }
      }
    };
    
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake-image-data'));
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    
    (storage.uploadMedia as any).mockResolvedValue('https://storage.naija-agent.com/org1/test.jpg');

    const result = await MediaInterceptor.execute(mockCtx as any);

    expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/test.jpg');
    expect(storage.uploadMedia).toHaveBeenCalledWith('org1', expect.stringContaining('.jpeg'), expect.any(Buffer), 'image/jpeg', expect.any(Object));
    expect(result.archivedMediaUrl).toBe('https://storage.naija-agent.com/org1/test.jpg');
    expect(result.mediaBuffer).toBeDefined();
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.jpg');
  });
});
