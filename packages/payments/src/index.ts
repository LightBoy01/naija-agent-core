import { PaystackProvider } from './paystack';

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
  verify(reference: string, expectedAmount: number): Promise<Transaction | null>;
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
}

export { PaystackProvider };

export function getProvider(type: 'paystack' | 'mock', secretKey?: string): PaymentProvider {
  if (type === 'paystack') {
    if (!secretKey) throw new Error('Paystack Secret Key required');
    return new PaystackProvider(secretKey);
  }
  return new MockProvider();
}
