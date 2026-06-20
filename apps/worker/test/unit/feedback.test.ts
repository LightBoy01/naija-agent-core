import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCommerceTools } from '../../src/tools/commerce';

// Mock dependencies
vi.mock('@naija-agent/firebase', () => ({
  logSystemEvent: vi.fn().mockResolvedValue(true)
}));
import { logSystemEvent } from '@naija-agent/firebase';

describe('collect_customer_feedback', () => {
  const mockCtx: any = {
    orgId: 'org1',
    from: '1234567890'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error for invalid rating', async () => {
    const result = await handleCommerceTools('collect_customer_feedback', { rating: 6, comment: "Too high" }, mockCtx);
    expect(result.status).toBe('error');
    expect(result.message).toContain('Rating must be between 1 and 5');
    expect(logSystemEvent).not.toHaveBeenCalled();
  });

  it('should log event and return positive viral message for 5-star rating', async () => {
    const result = await handleCommerceTools('collect_customer_feedback', { rating: 5, comment: "Amazing!" }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.message).toContain('wa.me/2347011925076');
    expect(logSystemEvent).toHaveBeenCalledWith(
      'org1', 
      'CUSTOMER_FEEDBACK', 
      'Rating: 5/5. Comment: Amazing!', 
      expect.objectContaining({ rating: 5, comment: "Amazing!" })
    );
  });

  it('should log event and return neutral message for 3-star rating without viral link', async () => {
    const result = await handleCommerceTools('collect_customer_feedback', { rating: 3, comment: "Okayish" }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.message).not.toContain('wa.me');
    expect(result.message).toContain('improve our service');
    expect(logSystemEvent).toHaveBeenCalledWith(
      'org1', 
      'CUSTOMER_FEEDBACK', 
      'Rating: 3/5. Comment: Okayish', 
      expect.objectContaining({ rating: 3 })
    );
  });
});
