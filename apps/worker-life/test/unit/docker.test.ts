import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerService } from '../../src/services/dockerService.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as vi.Mocked<typeof axios>;

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('DockerService', () => {
  let dockerService: DockerService;

  beforeEach(() => {
    vi.clearAllMocks();
    dockerService = new DockerService();
  });

  it('should successfully orchestrate a Hermes container', async () => {
    // 1. Mock container creation
    mockedAxios.post.mockResolvedValueOnce({
      data: { Id: 'test-container-id' }
    });

    // 2. Mock container start
    mockedAxios.post.mockResolvedValueOnce({});

    // 3. Mock container inspection (first running, then stopped)
    mockedAxios.get.mockResolvedValueOnce({
      data: { State: { Running: true } }
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: { State: { Running: false, ExitCode: 0 } }
    });

    const result = await dockerService.runHermesTask({
      instruction: 'Test instruction',
      userPhone: '2348000000000',
      orgId: 'test-org'
    });

    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/containers/create'),
      expect.anything(),
      expect.anything()
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/containers/test-container-id/start'),
      expect.anything(),
      expect.anything()
    );
  }, 15000); // Increased timeout for polling simulation

  it('should handle container failures', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('Docker engine unavailable'));

    const result = await dockerService.runHermesTask({
      instruction: 'Test instruction',
      userPhone: '2348000000000',
      orgId: 'test-org'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Docker engine unavailable');
  });
});
