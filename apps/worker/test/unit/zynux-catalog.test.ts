import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../../src/handlers/messaging.js';
import { Job } from 'bullmq';
import { handleToolCall } from '../../src/tool-handlers.js';

// Mock dependencies
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  }
}));

vi.mock('../../src/services/whatsapp.js', () => {
  return {
    WhatsAppService: vi.fn().mockImplementation(() => ({
      sendText: vi.fn().mockResolvedValue(true),
      sendImage: vi.fn().mockResolvedValue(true),
      sendTypingIndicator: vi.fn().mockResolvedValue(true),
      downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from('mock-data'), mimeType: 'image/jpeg' })
    }))
  };
});

vi.mock('@naija-agent/database', () => ({
  getChatHistory: vi.fn().mockResolvedValue([]),
  findOrCreateChat: vi.fn().mockResolvedValue('test-chat-id'),
  saveMessage: vi.fn().mockResolvedValue(true),
  verifyAdminSession: vi.fn().mockResolvedValue(true),
  getChatDemoState: vi.fn().mockResolvedValue(null),
  setChatDemoState: vi.fn().mockResolvedValue(true)
}));

vi.mock('@naija-agent/firebase', () => ({
  getAllKnowledge: vi.fn().mockResolvedValue({}),
  getProducts: vi.fn().mockResolvedValue([]),
  saveProduct: vi.fn().mockResolvedValue(true),
  searchProducts: vi.fn().mockResolvedValue([])
}));

vi.mock('../../src/services/promptService.js', () => ({
  promptService: {
    getPrompt: vi.fn().mockReturnValue('Mock Prompt')
  }
}));

vi.mock('../../src/tool-handlers.js', () => ({
  handleToolCall: vi.fn()
}));

describe('Zynux Messaging - Image & Catalog', () => {
  const mockAi = {
    chat: vi.fn(),
    analyzeImage: vi.fn(),
    embedText: vi.fn()
  };

  const mockDeps = {
    org: { id: 'test-org', timezone: 'Africa/Lagos' },
    isAdmin: true,
    isStaff: false,
    staffData: null,
    tenantWhatsAppService: {
      sendText: vi.fn(),
      sendTypingIndicator: vi.fn().mockResolvedValue(true),
      downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from('test'), mimeType: 'image/jpeg' })
    } as any,
    tenantPaymentProvider: null,
    ai: mockAi as any,
    redisClient: {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn()
    } as any,
    tenantTools: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process an incoming image message', async () => {
    const imageJob = {
      data: {
        from: '2348000000000',
        orgId: 'test-org',
        type: 'image',
        content: { imageId: 'img-123', caption: 'How much is this?' }
      }
    } as Job;

    mockAi.analyzeImage.mockResolvedValueOnce({
      text: JSON.stringify({ whatsapp_message: 'That is 5k', internal_thoughts: 'Detected shoe' })
    });

    const result = await handleMessage(imageJob, mockDeps);

    expect(result.success).toBe(true);
    expect(mockAi.analyzeImage).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'How much is this?', expect.anything());
  });

  it('should handle catalog updates via save_product tool', async () => {
    const textJob = {
        data: {
          from: '2348000000000',
          orgId: 'test-org',
          type: 'text',
          content: { text: 'Update price of Bread to 1000' }
        }
      } as Job;

    mockAi.chat.mockResolvedValueOnce({
      text: JSON.stringify({ whatsapp_message: 'Updating...', internal_thoughts: 'Calling save_product' }),
      functionCalls: [{
        name: 'save_product',
        args: { key: 'Bread', content: '1000' }
      }]
    });

    (handleToolCall as any).mockResolvedValueOnce({ status: 'success', message: 'Product saved' });

    mockAi.chat.mockResolvedValueOnce({
        text: JSON.stringify({ whatsapp_message: 'Updated!', internal_thoughts: 'Done' })
    });

    await handleMessage(textJob, mockDeps);

    expect(handleToolCall).toHaveBeenCalledWith('save_product', expect.objectContaining({ key: 'Bread' }), expect.anything());
  });
});
