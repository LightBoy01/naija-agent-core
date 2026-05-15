import { PaystackProvider } from './paystack';
import { MonnifyProvider } from './monnify';

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
  payout?(args: { amount: number, bankCode: string, accountNumber: string, reference: string, narration?: string }): Promise<{ success: boolean; message: string; reference?: string }>;
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

export { PaystackProvider, MonnifyProvider };

export function getProvider(type: 'paystack' | 'monnify' | 'mock', secretKey?: string): PaymentProvider {
  if (type === 'paystack') {
    if (!secretKey) throw new Error('Paystack Secret Key required');
    return new PaystackProvider(secretKey);
  }
  if (type === 'monnify') {
    if (!secretKey) throw new Error('Monnify Secret Key required (Format: API_KEY:SECRET_KEY)');
    return new MonnifyProvider(secretKey);
  }
  return new MockProvider();
}
