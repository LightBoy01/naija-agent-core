import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLifeChat } from '../../src/handlers/chatHandler.js';
import { Job } from 'bullmq';

// Mock dependencies
vi.mock('ioredis', () => {
  class MockRedis {
    on = vi.fn();
    get = vi.fn();
    set = vi.fn();
    del = vi.fn();
    incr = vi.fn();
    expire = vi.fn();
  }
  return {
    Redis: MockRedis
  };
});

vi.mock('bullmq', () => {
  class MockQueue {
    add = vi.fn();
  }
  class MockWorker {
    on = vi.fn();
  }
  return {
    Queue: MockQueue,
    Worker: MockWorker,
    Job: vi.fn()
  };
});

vi.mock('../index.js', () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    on: vi.fn()
  },
  lifeQueue: {
    add: vi.fn()
  }
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../src/services/whatsapp.js', () => ({
  whatsappService: {
    sendText: vi.fn().mockResolvedValue(true),
    sendTypingIndicator: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../src/services/billingService.js', () => ({
  billingService: {
    billForTool: vi.fn().mockResolvedValue({ success: true, newBalance: 1000 }),
    billForMessage: vi.fn().mockResolvedValue(true),
    refundCredits: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../src/services/promptService.js', () => ({
  promptService: {
    getPrompt: vi.fn().mockReturnValue('Mock Soul Prompt')
  }
}));

vi.mock('@naija-agent/database', () => ({
  getChatHistory: vi.fn().mockResolvedValue([]),
  findOrCreateChat: vi.fn().mockResolvedValue('test-chat-id'),
  saveMessage: vi.fn().mockResolvedValue(true)
}));

vi.mock('@naija-agent/firebase', () => ({
  getOrgById: vi.fn().mockResolvedValue({ id: 'test-org' }),
  getDb: vi.fn().mockReturnValue({
    collection: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ empty: true })
  })
}));

vi.mock('../../src/services/lifeMemory.js', () => ({
  lifeMemory: {
    getContext: vi.fn().mockResolvedValue({ energyCredits: 100, goals: [] }),
    searchSemanticMemory: vi.fn().mockResolvedValue([]),
    updateContext: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../src/services/heartbeat.js', () => ({
  heartbeatService: {
    getUserConfigs: vi.fn().mockResolvedValue([]),
    checkRecentReminder: vi.fn().mockResolvedValue(null),
    createReminder: vi.fn().mockResolvedValue({ id: 'reminder-123' })
  }
}));

vi.mock('../../src/utils/timezone.js', () => ({
  getTimezoneFromPhone: vi.fn().mockReturnValue('Africa/Lagos')
}));

describe('Life Chat Handler', () => {
  const mockAi = {
    chat: vi.fn(),
    analyzeImage: vi.fn(),
    embedText: vi.fn().mockResolvedValue(new Array(768).fill(0))
  };

  const mockDeps = {
    ai: mockAi as any,
    getDynamicModels: vi.fn().mockResolvedValue({ primaryModel: 'test-model', tools: [] }),
    lifeQueue: {
      add: vi.fn().mockResolvedValue({})
    },
    apiKey: 'test-api-key'
  };

  const mockJob = {
    data: {
      userPhone: '2348000000000',
      message: 'Hello Aelixxr',
      orgId: 'test-org',
      type: 'text'
    }
  } as Job;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process a simple text message', async () => {
    mockAi.chat.mockResolvedValueOnce({ text: 'Hello! How can I help you today?' });

    const result = await handleLifeChat(mockJob, mockDeps);

    expect(result.success).toBe(true);
    expect(mockAi.chat).toHaveBeenCalled();
    const { whatsappService } = await import('../../src/services/whatsapp.js');
    expect(whatsappService.sendText).toHaveBeenCalledWith('+2348000000000', expect.stringContaining('Hello!'), undefined);
  });

  it('should handle delegation to SLM', async () => {
    mockAi.chat.mockResolvedValueOnce({
      text: 'Consulting expert...',
      functionCalls: [{
        name: 'delegate_task',
        args: {
          sector: 'ResearchPack',
          instruction: 'Search for Nigerian inflation rates',
          raw_parameters: { query: 'inflation' }
        }
      }]
    });

    const result = await handleLifeChat(mockJob, mockDeps);

    expect(result.success).toBe(true);
    expect(result.delegated).toBe(true);
    expect(mockDeps.lifeQueue.add).toHaveBeenCalledWith('execute-slm-task', expect.objectContaining({
      sector: 'ResearchPack'
    }));
  });

  it('should trigger the loop guard if hops are too high', async () => {
    const loopJob = {
      data: {
        ...mockJob.data,
        hops: 3
      }
    } as Job;

    const result = await handleLifeChat(loopJob, mockDeps);

    expect(result.success).toBe(false);
    expect(result.error).toBe('LOOP_GUARD_TRIGGERED');
    const { whatsappService } = await import('../../src/services/whatsapp.js');
    expect(whatsappService.sendText).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('loop'), undefined);
  });
});
