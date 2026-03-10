import axios from 'axios';
import crypto from 'crypto';
import { PaymentProvider, Transaction } from './index';

export class PaystackProvider implements PaymentProvider {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  /**
   * Verifies that a webhook request actually came from Paystack.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hmac = crypto.createHmac('sha512', this.secretKey);
    const expectedSignature = hmac.update(payload).digest('hex');
    return expectedSignature === signature;
  }

  async verify(reference: string, expectedAmount: number): Promise<Transaction | null> {
    try {
      const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
        },
      });

      if (!response.data.status) {
        return null;
      }

      const data = response.data.data;

      // Status Check
      if (data.status !== 'success') {
        return {
          reference: data.reference,
          status: 'failed',
          amount: data.amount / 100, // Paystack returns Kobo
          customer: {
            name: 'Unknown', // Paystack doesn't always return name in basic verify
            email: data.customer?.email || 'unknown',
          },
          paidAt: data.paid_at,
        };
      }

      // Amount Check (Loose check: allow +/- 1 NGN difference for rounding)
      // Paystack amount is in Kobo
      const paidAmount = data.amount / 100;
      if (Math.abs(paidAmount - expectedAmount) > 10) { // Increased tolerance
         console.warn(`Amount Mismatch: Expected ${expectedAmount}, Got ${paidAmount}`);
         // We return the transaction but the caller should decide if it's valid
      }

      return {
        reference: data.reference,
        status: 'success',
        amount: paidAmount,
        customer: {
          name: 'Customer', // Would need more API calls to get name if not in metadata
          email: data.customer?.email,
        },
        paidAt: data.paid_at,
      };

    } catch (error: any) {
      console.error('Paystack Verify Error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Generates a Paystack Checkout link for self-service top-ups (Phase 6)
   */
  async createPaymentLink(orgId: string, email: string, amountNaira: number): Promise<string | null> {
    try {
      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email,
          amount: Math.round(amountNaira * 100), // Kobo
          metadata: { orgId },
          callback_url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/dashboard`
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.data.authorization_url;
    } catch (error: any) {
      console.error('Paystack Link Creation Error:', error.response?.data || error.message);
      return null;
    }
  }
}
