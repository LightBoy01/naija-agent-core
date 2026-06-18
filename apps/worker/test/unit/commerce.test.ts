import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCommerceTools } from '../../src/tools/commerce.js';
import { HandlerContext } from '../../src/tools/definitions.js';

// Mock dependencies
vi.mock('@naija-agent/firebase', () => ({
  checkTransaction: vi.fn(),
  logTransaction: vi.fn(),
  topupTenant: vi.fn(),
  getActivityByCustomer: vi.fn(),
  updateActivity: vi.fn(),
  finalizeSale: vi.fn(),
  logPendingTransaction: vi.fn(),
  logSystemEvent: vi.fn()
}));

vi.mock('@naija-agent/database', () => ({
  syncCartState: vi.fn(),
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  }),
  fraudRegistry: {},
  eq: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
}));

const mockRedisClient = {
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
};

const mockWhatsappService = {
  sendText: vi.fn().mockResolvedValue(true)
};

const mockPaymentProvider = {
  verify: vi.fn()
};

describe('Commerce Tools - Amount Lock Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseCtx: HandlerContext = {
    orgId: 'test-org',
    from: 'test-user',
    isStaff: false,
    isAdmin: false,
    isAuth: false,
    whatsappService: mockWhatsappService as any,
    paymentProvider: mockPaymentProvider as any,
    redisClient: mockRedisClient as any,
    orgConfig: {},
    currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' },
    whatsappPhoneId: 'test-phone-id',
    customerName: 'Test Customer'
  };

  it('should return AMOUNT_MISMATCH if receipt amount differs from bank API amount by more than 10', async () => {
    // Setup mock payment provider to return a success status but with a different amount
    mockPaymentProvider.verify.mockResolvedValueOnce({
      status: 'success',
      amount: 4000 // Bank says 4000
    });

    const args = {
      reference: 'TEST_REF_123',
      amount: 5000, // Receipt claims 5000
      isSuspicious: false
    };

    const result = await handleCommerceTools('verify_transaction', args, baseCtx);

    expect(mockPaymentProvider.verify).toHaveBeenCalledWith('TEST_REF_123', 5000);
    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
    expect(result.code).toBe('AMOUNT_MISMATCH');
    expect(result.message).toContain('4,000');
    expect(result.message).toContain('5,000');
  });

  it('should verify successfully if receipt amount matches bank API amount', async () => {
    // Setup mock payment provider to return matching amount
    mockPaymentProvider.verify.mockResolvedValueOnce({
      status: 'success',
      amount: 5000 // Bank says 5000
    });

    const args = {
      reference: 'TEST_REF_123',
      amount: 5000, // Receipt claims 5000
      isSuspicious: false,
      purpose: 'sale'
    };

    const result = await handleCommerceTools('verify_transaction', args, baseCtx);

    expect(result).toBeDefined();
    expect(result.status).toBe('verified');
  });

  it('should allow a small discrepancy (less than or equal to 10)', async () => {
    // Setup mock payment provider
    mockPaymentProvider.verify.mockResolvedValueOnce({
      status: 'success',
      amount: 4995 // Bank says 4995
    });

    const args = {
      reference: 'TEST_REF_123',
      amount: 5000, // Receipt claims 5000
      isSuspicious: false,
      purpose: 'sale'
    };

    const result = await handleCommerceTools('verify_transaction', args, baseCtx);

    expect(result).toBeDefined();
    expect(result.status).toBe('verified');
  });
});
