import { PaystackProvider } from './paystack';
import { MonnifyProvider } from './monnify';
import { PocketFiProvider } from './pocketfi';
import { PeyflexProvider } from './peyflex';

export interface Transaction {
  reference: string;
  status: 'success' | 'failed' | 'pending';
  amount: number;
  customer: {
    name: string;
    email: string;
  };
  paidAt: string;
}

export interface PaymentProvider {
  verify(reference: string, amount: number): Promise<Transaction | null>;
  createPaymentLink(orgId: string, email: string, amountNaira: number): Promise<string | null>;
  payout?(args: { amount: number, bankCode: string, accountNumber: string, reference: string, narration?: string, accountName?: string }): Promise<{ success: boolean; message: string; reference?: string }>;
  refund?(transactionReference: string, amountNaira?: number, reason?: string): Promise<{ success: boolean; message: string; refundReference?: string }>;
}


export class MockProvider implements PaymentProvider {
  async verify(reference: string, expectedAmount: number): Promise<Transaction | null> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (reference.startsWith('FAKE')) {
      return null;
    }

    return {
      reference,
      status: 'success',
      amount: expectedAmount,
      customer: {
        name: 'Mock Customer',
        email: 'mock@example.com',
      },
      paidAt: new Date().toISOString(),
    };
  }

  async createPaymentLink(orgId: string, email: string, amountNaira: number): Promise<string | null> {
    // Generate a dummy Paystack checkout link
    return `https://checkout.paystack.com/mock-refill-${orgId}-${Date.now()}`;
  }
}

export { PaystackProvider, MonnifyProvider, PocketFiProvider, PeyflexProvider };

export function getProvider(
  type: 'paystack' | 'monnify' | 'pocketfi' | 'mock', 
  secretKey?: string, 
  redirectUrl?: string, 
  businessId?: string, 
  isLive: boolean = false
): PaymentProvider {
  if (type === 'paystack') {
    if (!secretKey) throw new Error('Paystack Secret Key required');
    return new PaystackProvider(secretKey);
  }
  if (type === 'monnify') {
    if (!secretKey) throw new Error('Monnify Secret Key required (Format: API_KEY:SECRET_KEY)');
    return new MonnifyProvider(secretKey, redirectUrl);
  }
  if (type === 'pocketfi') {
    if (!secretKey || !businessId) throw new Error('PocketFi Secret Key and Business ID required');
    return new PocketFiProvider(secretKey, businessId, isLive, redirectUrl);
  }
  return new MockProvider();
}
