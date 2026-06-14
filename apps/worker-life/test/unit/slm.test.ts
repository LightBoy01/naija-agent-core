import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSLMTask } from '../../src/handlers/slmHandler.js';
import { Job } from 'bullmq';

// Mock dependencies
vi.mock('ioredis', () => {
  class MockRedis {
    on = vi.fn();
    get = vi.fn();
    set = vi.fn();
    del = vi.fn();
  }
  return { Redis: MockRedis };
});

vi.mock('bullmq', () => {
  class MockQueue {
    add = vi.fn();
  }
  return { Queue: MockQueue, Job: vi.fn() };
});

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../src/services/billingService.js', () => ({
  billingService: {
    billForTool: vi.fn().mockResolvedValue({ success: true, newBalance: 1000 })
  }
}));

vi.mock('../../src/services/dockerService.js', () => ({
  dockerService: {
    runHermesTask: vi.fn()
  }
}));

vi.mock('../../src/services/promptService.js', () => ({
  promptService: {
    getPrompt: vi.fn().mockReturnValue('Mock SLM Prompt')
  }
}));

vi.mock('@naija-agent/database', () => ({
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([])
  }),
  organizations: {},
  cronJobs: {},
  advanceCronJob: vi.fn().mockResolvedValue(true)
}));

describe('SLM Handler', () => {
  const mockAi = {
    chat: vi.fn()
  };

  const mockDeps = {
    ai: mockAi as any,
    lifeQueue: {
      add: vi.fn().mockResolvedValue({})
    },
    globalLifeTools: [],
    getLifeTools: vi.fn().mockResolvedValue([])
  };

  const mockJob = {
    data: {
      userPhone: '2348000000000',
      instruction: 'Run test task',
      orgId: 'test-org',
      sector: 'ResearchPack',
      isHermesDelegation: false
    }
  } as unknown as Job;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a standard SLM task', async () => {
    mockAi.chat.mockResolvedValueOnce({
      text: JSON.stringify({ status: 'success', report: 'Task completed' })
    });

    const result = await handleSLMTask(mockJob, mockDeps);

    expect(result.success).toBe(true);
    expect(mockAi.chat).toHaveBeenCalled();
    expect(mockDeps.lifeQueue.add).toHaveBeenCalledWith('life-chat-resume', expect.anything(), expect.anything());
  });

  it('should handle Hermes delegation via Docker', async () => {
    const hermesJob = {
      data: {
        ...mockJob.data,
        isHermesDelegation: true,
        budgetNaira: 500
      }
    } as unknown as Job;

    const { dockerService } = await import('../../src/services/dockerService.js');
    (dockerService.runHermesTask as any).mockResolvedValueOnce({ success: true });

    const result = await handleSLMTask(hermesJob, mockDeps);

    expect(result.success).toBe(true);
    expect(dockerService.runHermesTask).toHaveBeenCalledWith(expect.objectContaining({
      budgetNaira: 500
    }));
    expect(mockDeps.lifeQueue.add).toHaveBeenCalledWith('life-chat-resume', expect.anything(), expect.anything());
  });

  it('should abort if max hops are reached', async () => {
    const stalledJob = {
      data: {
        ...mockJob.data,
        hops: 5
      }
    } as unknown as Job;

    const result = await handleSLMTask(stalledJob, mockDeps);

    expect(result.success).toBe(false);
    expect(result.error).toBe('max_hops_reached');
  });
});
