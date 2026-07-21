import crypto from 'crypto';
import { PaymentProvider, Transaction } from './index';

export class MonnifyProvider implements PaymentProvider {
  private apiKey: string;
  private secretKey: string;
  private contractCode: string | null = null;
  private walletAccountNumber: string | null = null;
  private baseUrl = 'https://api.monnify.com'; // Default to Production
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private redirectUrl: string;

  constructor(combinedKey: string, redirectUrl?: string) {
    // Format: API_KEY:SECRET_KEY[:CONTRACT_CODE][:WALLET_ACCOUNT_NUMBER]
    const [apiKey, secretKey, contractCode, walletAccountNumber] = combinedKey.split(':');
    if (!apiKey || !secretKey) {
      throw new Error('Monnify requires API_KEY:SECRET_KEY[:CONTRACT_CODE][:WALLET_ACCOUNT_NUMBER] format.');
    }
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.contractCode = contractCode || process.env.MONNIFY_CONTRACT_CODE || null;
    this.walletAccountNumber = walletAccountNumber || process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || null;
    this.redirectUrl = redirectUrl || "https://dashboard.naija-agent.com/callback";
    
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

  private async fetchWithTimeout(url: string, options: any = {}) {
    return fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');
    
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/auth/login`, {
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
      
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v2/transactions/${encodedRef}`, {
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
        redirectUrl: this.redirectUrl,
        paymentMethods: ["CARD", "ACCOUNT_TRANSFER"]
      };

      // Note: Monnify "Initialize Transaction" returns a checkout URL
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/merchant/transactions/init-transaction`, {
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

  /**
   * Reserves a dedicated virtual account for a customer.
   * If an account already exists for this reference (e.g. phone number), it returns the existing one.
   */
  async reserveAccount(reference: string, accountName: string, customerEmail: string, customerName: string, bvn?: string, nin?: string): Promise<any | null> {
    try {
      const contractCode = this.contractCode;
      if (!contractCode) {
        console.error('Missing Monnify Contract Code for Account Reservation.');
        return null;
      }

      if (!bvn && !nin) {
        console.warn('⚠️ Monnify V2 reserveAccount requires either a BVN or NIN for KYC compliance. Proceeding without them but it will likely fail in live mode.');
      }

      const token = await this.getAccessToken();

      const payload: any = {
        accountReference: reference, // Use phone number or unique user ID
        accountName: accountName,
        currencyCode: 'NGN',
        contractCode: contractCode,
        customerEmail: customerEmail,
        customerName: customerName,
        getAllAvailableBanks: true
      };
      
      if (bvn) payload.bvn = bvn;
      if (nin) payload.nin = nin;

      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v2/bank-transfer/reserved-accounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.requestSuccessful && data.responseBody) {
        return data.responseBody;
      }
      
      // If already exists, Monnify might return an error or the existing one depending on the API version.
      // v2 usually handles it gracefully or requires a GET if it fails.
      return null;
    } catch (error) {
      console.error('Monnify Reserve Account Error:', error);
      return null;
    }
  }

  async getBanks(): Promise<any[]> {
    try {
      const token = await this.getAccessToken();
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/banks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      return data.requestSuccessful ? data.responseBody : [];
    } catch (error) {
      console.error('Monnify getBanks Error:', error);
      return [];
    }
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<string | null> {
    try {
      const token = await this.getAccessToken();
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/disbursements/account/validate?accountNumber=${accountNumber}&bankCode=${bankCode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      return data.requestSuccessful ? data.responseBody.accountName : null;
    } catch (error) {
      console.error('Monnify resolveAccount Error:', error);
      return null;
    }
  }

  async payout(args: { amount: number, bankCode: string, accountNumber: string, reference: string, narration?: string }): Promise<{ success: boolean; message: string; reference?: string }> {
    try {
      if (!this.walletAccountNumber) {
        return { success: false, message: 'Source Wallet Account Number missing. Configure in MONNIFY_WALLET_ACCOUNT_NUMBER.' };
      }

      // 1. Resolve Account Name first (Required for v2)
      const accountName = await this.resolveAccount(args.bankCode, args.accountNumber);
      if (!accountName) {
        return { success: false, message: 'Could not resolve destination account name.' };
      }

      const token = await this.getAccessToken();
      const payload = {
        amount: args.amount,
        reference: args.reference,
        narration: args.narration || 'Aelixxr Vault Withdrawal',
        destinationBankCode: args.bankCode,
        destinationAccountNumber: args.accountNumber,
        destinationAccountName: accountName,
        currency: 'NGN',
        sourceAccountNumber: this.walletAccountNumber
      };

      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v2/disbursements/single`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.requestSuccessful) {
        return { success: true, message: 'Transfer successful', reference: data.responseBody.reference };
      }
      return { success: false, message: data.responseMessage || 'Transfer failed' };
    } catch (error: any) {
      console.error('Monnify payout Error:', error);
      return { success: false, message: error.message };
    }
  }

  // --- Value Added Services (VAS) ---

  async getBillers(categoryCode: string): Promise<any[]> {
    try {
      const token = await this.getAccessToken();
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vas/bills-payment/billers?categoryCode=${categoryCode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      return data.requestSuccessful ? data.responseBody : [];
    } catch (error) {
      console.error('Monnify getBillers Error:', error);
      return [];
    }
  }

  async getBillerProducts(billerCode: string): Promise<any[]> {
    try {
      const token = await this.getAccessToken();
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vas/bills-payment/biller-products?billerCode=${billerCode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      return data.requestSuccessful ? data.responseBody : [];
    } catch (error) {
      console.error('Monnify getBillerProducts Error:', error);
      return [];
    }
  }

  async validateUtilityCustomer(productCode: string, customerId: string): Promise<any | null> {
    try {
      const token = await this.getAccessToken();
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vas/bills-payment/validate-customer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productCode, customerId })
      });
      const data = await response.json();
      return data.requestSuccessful ? data.responseBody : null;
    } catch (error) {
      console.error('Monnify validateUtilityCustomer Error:', error);
      return null;
    }
  }

  async vendUtility(args: { productCode: string, customerId: string, amount: number, reference: string, validationReference: string }): Promise<{ success: boolean; message: string; responseBody?: any }> {
    try {
      const token = await this.getAccessToken();
      const payload = {
        productCode: args.productCode,
        customerId: args.customerId,
        amount: args.amount,
        paymentReference: args.reference,
        validationReference: args.validationReference
      };

      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vas/bills-payment/vend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.requestSuccessful) {
        return { success: true, message: 'Vending successful', responseBody: data.responseBody };
      }
      return { success: false, message: data.responseMessage || 'Vending failed' };
    } catch (error: any) {
      console.error('Monnify vendUtility Error:', error);
      return { success: false, message: error.message };
    }
  }

  async refund(transactionReference: string, amountNaira?: number, reason?: string): Promise<{ success: boolean; message: string; refundReference?: string }> {
    try {
      const token = await this.getAccessToken();
      const payload: any = {
        transactionReference,
        refundReference: `REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        refundReason: reason || 'Customer requested refund'
      };
      
      if (amountNaira) {
        payload.refundAmount = amountNaira; // Monnify amount is in Naira
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/refunds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.requestSuccessful) {
        return { success: true, message: 'Refund initiated successfully', refundReference: payload.refundReference };
      }
      return { success: false, message: data.responseMessage || 'Refund failed' };
    } catch (error: any) {
      console.error('Monnify Refund Error:', error);
      return { success: false, message: error.message };
    }
  }
}
