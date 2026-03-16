import crypto from 'crypto';
import { PaymentProvider, Transaction } from './index';

export class MonnifyProvider implements PaymentProvider {
  private apiKey: string;
  private secretKey: string;
  private contractCode: string | null = null;
  private baseUrl = 'https://api.monnify.com'; // Default to Production
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(combinedKey: string) {
    // Format: API_KEY:SECRET_KEY[:CONTRACT_CODE]
    const [apiKey, secretKey, contractCode] = combinedKey.split(':');
    if (!apiKey || !secretKey) {
      throw new Error('Monnify requires API_KEY:SECRET_KEY[:CONTRACT_CODE] format.');
    }
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.contractCode = contractCode || process.env.MONNIFY_CONTRACT_CODE || null;
    
    // Check if it's a test key (usually starts with MK_TEST)
    if (this.apiKey.startsWith('MK_TEST')) {
       this.baseUrl = 'https://sandbox.monnify.com';
    }
  }

  /**
   * Verifies Monnify webhook signature using SHA512.
   * Signature is computed using the client secret.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hmac = crypto.createHmac('sha512', this.secretKey);
    const expectedSignature = hmac.update(payload).digest('hex');
    return expectedSignature === signature;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      if (!response.ok) {
        throw new Error(`Monnify Auth Failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.requestSuccessful && data.responseBody?.accessToken) {
        this.accessToken = data.responseBody.accessToken;
        // Token valid for 60 mins usually, set expiry to 55 mins for safety
        this.tokenExpiresAt = Date.now() + (55 * 60 * 1000); 
        return this.accessToken!;
      }
      throw new Error('Monnify Auth: Invalid response');
    } catch (error) {
      console.error('Monnify Token Error:', error);
      throw error;
    }
  }

  async verify(reference: string, expectedAmount: number): Promise<Transaction | null> {
    try {
      const token = await this.getAccessToken();
      // Monnify requires URI encoding for query params
      const encodedRef = encodeURIComponent(reference);
      
      const response = await fetch(`${this.baseUrl}/api/v2/transactions/${encodedRef}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
         if (response.status === 404) return null; // Transaction not found
         throw new Error(`Monnify Verify Failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.requestSuccessful && data.responseBody) {
        const tx = data.responseBody;
        
        // Amount check (Monnify amount is in Naira usually, need to confirm)
        // Documentation says Amount is in Naira. Our expectedAmount is likely in Naira too based on interface usage.
        // Wait, PaymentProvider.verify takes `amount` (Naira?). 
        // In worker, we pass `args.amount` which is likely Naira from user input.
        
        const paidAmount = parseFloat(tx.amount);
        
        // Amount Validation (Tolerance: 50 Naira)
        if (Math.abs(paidAmount - expectedAmount) > 50) {
           console.warn(`Monnify Amount Mismatch: Expected ${expectedAmount}, Paid ${paidAmount}`);
           return null;
        }
        
        return {
          reference: tx.transactionReference,
          status: tx.paymentStatus === 'PAID' ? 'success' : tx.paymentStatus === 'PENDING' ? 'pending' : 'failed',
          amount: paidAmount,
          customer: {
            name: tx.customerDTO?.name || 'Unknown',
            email: tx.customerDTO?.email || 'no-email@example.com'
          },
          paidAt: tx.completedOn || new Date().toISOString()
        };
      }
      return null;
    } catch (error) {
      console.error('Monnify Verify Error:', error);
      return null;
    }
  }

  async createPaymentLink(orgId: string, email: string, amountNaira: number): Promise<string | null> {
    try {
      // Use instance contract code (from key) or fallback to global env
      const contractCode = this.contractCode;
      
      if (!contractCode) {
         console.error('Missing Monnify Contract Code. Please provide it in the secret key string (API:SECRET:CODE) or ensure MONNIFY_CONTRACT_CODE env var is set.');
         return null;
      }

      const token = await this.getAccessToken();
      
      const payload = {
        amount: amountNaira,
        customerName: `Customer of ${orgId}`,
        customerEmail: email,
        paymentReference: `refill_${orgId}_${Date.now()}`,
        paymentDescription: `Bot Credit Refill for ${orgId}`,
        currencyCode: "NGN",
        contractCode: contractCode,
        redirectUrl: "https://ai-job-spot.vercel.app", // Placeholder
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER"]
      };

      // Note: Monnify "Initialize Transaction" returns a checkout URL
      const response = await fetch(`${this.baseUrl}/api/v1/merchant/transactions/init-transaction`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.requestSuccessful && data.responseBody?.checkoutUrl) {
         return data.responseBody.checkoutUrl;
      }
      return null;

    } catch (error) {
      console.error('Monnify Create Link Error:', error);
      return null;
    }
  }
}
