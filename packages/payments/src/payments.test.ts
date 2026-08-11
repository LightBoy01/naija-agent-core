import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Shared mock functions for axios.get/post
const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();

// Axios mock: create() returns instances with defaults.baseURL, get/post preserved
const mockAxiosCreate = vi.fn((config: any) => ({
  get: mockAxiosGet,
  post: mockAxiosPost,
  defaults: { baseURL: config?.baseURL || '' },
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock('axios', () => ({
  default: {
    create: (config: any) => mockAxiosCreate(config),
    get: (...args: any[]) => mockAxiosGet(...args),
    post: (...args: any[]) => mockAxiosPost(...args),
  },
}));

import { PaystackProvider } from './paystack.js';
import { MonnifyProvider } from './monnify.js';
import { PocketFiProvider } from './pocketfi.js';
import { PeyflexProvider } from './peyflex.js';
import { MockProvider } from './index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Paystack
// ============================================================
describe('PaystackProvider', () => {
  const provider = new PaystackProvider('sk_test_secret');

  describe('verifyWebhookSignature', () => {
    it('should compute valid HMAC-SHA512 signature', () => {
      const payload = JSON.stringify({ event: 'charge.success' });
      const expected = crypto.createHmac('sha512', 'sk_test_secret').update(payload).digest('hex');
      expect(provider.verifyWebhookSignature(payload, expected)).toBe(true);
    });
    it('should reject invalid signature', () => {
      expect(provider.verifyWebhookSignature('{}', 'fake-sig')).toBe(false);
    });
  });

  describe('verify', () => {
    it('should convert kobo to naira from Paystack response', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { status: true, data: { amount: 50000, status: 'success', reference: 'ref_456', paid_at: '2026-01-01T00:00:00Z', customer: { email: 'test@example.com' } } },
      });
      const result = await provider.verify('ref_456', 500);
      expect(result).not.toBeNull();
      expect(result!.amount).toBe(500);
      expect(result!.status).toBe('success');
    });

    it('should return failed when Paystack status is not success', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { status: true, data: { amount: 10000, status: 'failed', reference: 'ref_fail', paid_at: null, customer: { email: 'test@example.com' } } },
      });
      const result = await provider.verify('ref_fail', 100);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
    });

    it('should handle network errors gracefully', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network Error'));
      const result = await provider.verify('ref_net', 100);
      expect(result).toBeNull();
    });
  });

  describe('refund', () => {
    it('should initiate refund successfully', async () => {
      mockAxiosPost.mockResolvedValueOnce({ data: { data: { reference: 'refund_ref_001' } } });
      const result = await provider.refund('tx_ref', 100);
      expect(result.success).toBe(true);
      expect(result.refundReference).toBe('refund_ref_001');
    });
  });

  describe('createPaymentLink', () => {
    it('should return authorization URL on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({ data: { data: { authorization_url: 'https://checkout.paystack.com/pay/test' } } });
      const result = await provider.createPaymentLink('org1', 'test@test.com', 1000);
      expect(result).toBe('https://checkout.paystack.com/pay/test');
    });
  });
});

// ============================================================
// Monnify
// ============================================================
describe('MonnifyProvider', () => {
  it('should detect sandbox mode from MK_TEST prefix', () => {
    const p = new MonnifyProvider('MK_TEST_KEY:secret:contract');
    expect(p['baseUrl']).toBe('https://sandbox.monnify.com');
  });
  it('should default to production base URL', () => {
    const p = new MonnifyProvider('API_KEY:secret:contract');
    expect(p['baseUrl']).toBe('https://api.monnify.com');
  });
  it('should parse contract code from colon-delimited key', () => {
    const p = new MonnifyProvider('api:secret:CONTRACT_123');
    expect(p['contractCode']).toBe('CONTRACT_123');
  });
  it('should parse wallet account number from 4-part key', () => {
    const p = new MonnifyProvider('api:secret:contract:1234567890');
    expect(p['walletAccountNumber']).toBe('1234567890');
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid HMAC-SHA512 signature', () => {
      const p = new MonnifyProvider('api:monnify_secret:code');
      const payload = JSON.stringify({ event: 'successfulTransaction' });
      const expected = crypto.createHmac('sha512', 'monnify_secret').update(payload).digest('hex');
      expect(p.verifyWebhookSignature(payload, expected)).toBe(true);
    });
    it('should reject invalid signature', () => {
      const p = new MonnifyProvider('api:monnify_secret:code');
      expect(p.verifyWebhookSignature('{}', 'wrong-sig')).toBe(false);
    });
  });
});

// ============================================================
// PocketFi
// ============================================================
describe('PocketFiProvider', () => {
  it('should use test base URL when isLive is false', () => {
    const p = new PocketFiProvider('sk_test', 'biz_123', false);
    expect(p['api'].defaults.baseURL).toBe('https://api.pocketfi.ng/api/test');
  });
  it('should use live base URL when isLive is true', () => {
    const p = new PocketFiProvider('sk_live', 'biz_123', true);
    expect(p['api'].defaults.baseURL).toBe('https://api.pocketfi.ng/api/v1');
  });
});

// ============================================================
// Peyflex
// ============================================================
describe('PeyflexProvider', () => {
  const provider = new PeyflexProvider('test_token');

  describe('mapNetwork', () => {
    it('MTN → mtn_airtime', () => expect(provider['mapNetwork']('MTN', 'airtime')).toBe('mtn_airtime'));
    it('AIRTEL → airtel_airtime', () => expect(provider['mapNetwork']('AIRTEL', 'airtime')).toBe('airtel_airtime'));
    it('GLO → glo_airtime', () => expect(provider['mapNetwork']('GLO', 'airtime')).toBe('glo_airtime'));
    it('9MOBILE → 9mobile_airtime', () => expect(provider['mapNetwork']('9MOBILE', 'airtime')).toBe('9mobile_airtime'));
    it('lowercase input works', () => expect(provider['mapNetwork']('mtn', 'airtime')).toBe('mtn_airtime'));
    it('data type appends _data', () => expect(provider['mapNetwork']('MTN', 'data')).toBe('mtn_data'));
    it('unknown network gets lowercased fallback', () => expect(provider['mapNetwork']('UNKNOWN', 'airtime')).toBe('unknown_airtime'));
  });

  describe('getAirtimeClient', () => {
    it('should create airtime client pointing to portal host', () => {
      const client = provider['getAirtimeClient']();
      expect(client.defaults.baseURL).toBe('https://portal.peyflex.com.ng');
    });
    it('should reuse the same airtime client instance', () => {
      expect(provider['getAirtimeClient']()).toBe(provider['getAirtimeClient']());
    });
  });

  describe('purchaseAirtimeData', () => {
    it('should handle API errors gracefully', async () => {
      // When getAirtimeClient is called, it uses mockAxiosCreate which records baseURL.
      // The post mock is shared — mock it to fail.
      mockAxiosPost.mockRejectedValueOnce(new Error('Network Error'));

      const result = await provider.purchaseAirtimeData('MTN', 100, 'airtime', '08012345678');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Network Error');
    });
  });
});

// ============================================================
// MockProvider
// ============================================================
describe('MockProvider', () => {
  const provider = new MockProvider();

  it('should simulate successful payment verification', async () => {
    const result = await provider.verify('VALID_REF', 100);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('success');
    expect(result!.amount).toBe(100);
  });
  it('should reject fake references', async () => {
    expect(await provider.verify('FAKE_REF', 100)).toBeNull();
  });
  it('should generate a mock checkout link', async () => {
    const result = await provider.createPaymentLink('org1', 'test@test.com', 500);
    expect(result).toContain('https://checkout.paystack.com/mock-refill-org1-');
  });
});
