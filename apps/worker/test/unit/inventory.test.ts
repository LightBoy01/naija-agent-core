import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleInventoryTools } from '../../src/tools/inventory.js';
import { HandlerContext } from '../../src/tools/definitions.js';

// Mock firebase
vi.mock('@naija-agent/firebase', () => ({
  saveProduct: vi.fn().mockResolvedValue(true),
  saveStagingProduct: vi.fn().mockResolvedValue(true),
  deleteProduct: vi.fn().mockResolvedValue(true),
  searchProducts: vi.fn().mockResolvedValue([])
}));

describe('Inventory Tools Handler', () => {
  const mockCtx: Partial<HandlerContext> = {
    orgId: 'test-org',
    isVisionContext: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call saveProduct when executing save_product tool', async () => {
    const args = {
      key: 'Bread',
      content: '1000',
      imageUrl: 'https://test.com/bread.jpg'
    };

    const result = await handleInventoryTools('save_product', args, mockCtx as HandlerContext);

    const { saveProduct } = await import('@naija-agent/firebase');
    expect(saveProduct).toHaveBeenCalledWith('test-org', 'Bread', expect.objectContaining({
      content: '1000',
      imageUrl: 'https://test.com/bread.jpg'
    }));
    expect(result.status).toBe('success');
  });
});
