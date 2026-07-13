import axios, { AxiosInstance } from 'axios';
import { PaymentProvider, Transaction } from './index';

export class PocketFiProvider implements PaymentProvider {
  private api: AxiosInstance;
  private secretKey: string;
  private businessId: string;
  private redirectUrl?: string;

  constructor(secretKey: string, businessId: string, isLive: boolean = false, redirectUrl?: string) {
    this.secretKey = secretKey;
    this.businessId = businessId;
    this.redirectUrl = redirectUrl;

    const baseURL = isLive 
        ? 'https://api.pocketfi.ng/api/v1' 
        : 'https://api.pocketfi.ng/api/test';

    this.api = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  // --- 1. Checkout & Payments ---

  async createPaymentLink(orgId: string, email: string, amountNaira: number, phone?: string, firstName?: string, lastName?: string): Promise<string | null> {
    try {
      const response = await this.api.post('/checkout/request', {
        first_name: firstName || 'NaijaAgent',
        last_name: lastName || 'User',
        phone: phone || '00000000000',
        business_id: this.businessId,
        email,
        redirect_link: this.redirectUrl || 'https://naijaagent.com',
        amount: amountNaira.toString()
      });
      return response.data.payment_link || null;
    } catch (error: any) {
      console.error('PocketFi Create Payment Error:', error.response?.data || error.message);
      return null;
    }
  }

  async verify(reference: string, expectedAmount?: number): Promise<Transaction | null> {
    try {
      const response = await this.api.post('/checkout/confirm', {
        payment_id: reference
      });

      const data = response.data;
      if (data.status === 'success' || data.status === 'completed') {
        return {
          reference: data.payment_id,
          status: 'success',
          amount: parseFloat(data.amount),
          customer: {
            name: 'PocketFi User',
            email: 'unknown@pocketfi.ng'
          },
          paidAt: new Date().toISOString()
        };
      }
      return null;
    } catch (error: any) {
      console.error('PocketFi Verify Error:', error.response?.data || error.message);
      return null;
    }
  }

  // --- 2. Virtual Accounts (Alajo Vault) ---

  async createVirtualAccount(email: string, firstName: string, lastName: string, phone: string, bank: 'saveheaven' | 'kuda' | 'paga' | '9psb' | 'palmpay' = 'saveheaven', nin?: string, bvn?: string) {
    try {
      const payload: any = {
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        businessId: this.businessId,
        bank
      };
      
      if (nin) payload.nin = nin;
      if (bvn) payload.bvn = bvn;

      const response = await this.api.post('/virtual-accounts/create', payload);
      
      if (response.data.status === true && response.data.banks && response.data.banks.length > 0) {
        return {
          success: true,
          bankName: response.data.banks[0].bankName,
          accountNumber: response.data.banks[0].accountNumber,
          accountName: response.data.banks[0].accountName
        };
      }
      return { success: false, message: 'Failed to generate virtual account' };
    } catch (error: any) {
      console.error('PocketFi Create VA Error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  // --- 3. Payouts (Withdrawals) ---

  async getBanks(): Promise<{ name: string; code: string }[]> {
    try {
      const response = await this.api.get('/payout/bank-list');
      if (response.data.status === 'success' && response.data.banks) {
        return response.data.banks.map((b: any) => ({ name: b.bank_name, code: b.bank_code }));
      }
      return [];
    } catch (error: any) {
      console.error('PocketFi Get Banks Error:', error.response?.data || error.message);
      return [];
    }
  }

  async verifyBankAccount(accountNumber: string, bankCode: string) {
    try {
      const response = await this.api.post('/payout/verify-bank', {
        account_number: accountNumber,
        bank_code: bankCode
      });
      if (response.data.status === 'success') {
        return { success: true, accountName: response.data.account_name };
      }
      return { success: false, message: 'Invalid bank account' };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  async payout(args: { amount: number, bankCode: string, accountNumber: string, reference?: string, accountName?: string }): Promise<{ success: boolean; message: string; reference?: string }> {
    try {
      const response = await this.api.post('/payout/send', {
        account_name: args.accountName || 'PocketFi User',
        account_number: args.accountNumber,
        bank_code: args.bankCode,
        amount: args.amount.toString()
      });

      if (response.data.status === true) {
        return { 
          success: true, 
          message: response.data.message, 
          reference: response.data.transaction?.reference 
        };
      }
      return { success: false, message: response.data.message || 'Transfer failed' };
    } catch (error: any) {
      console.error('PocketFi Payout Error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  // --- 4. WhatsApp OTP ---
  
  async sendWhatsAppOTP(phone: string, otp: string, supportPhone?: string) {
      try {
          const response = await this.api.post('/request/otp', {
              support_number: supportPhone || '09000000000',
              phone_number: phone,
              business_id: this.businessId,
              otp
          });
          return { success: response.data.messages && response.data.messages[0]?.message_status === 'accepted' };
      } catch (error: any) {
          console.error('PocketFi OTP Error:', error.response?.data || error.message);
          return { success: false, message: error.message };
      }
  }

  // --- 5. Identity Verification (KYC) ---

  async verifyBVN(bvn: string): Promise<{ success: boolean; data?: any; message?: string }> {
      try {
          const response = await this.api.post('/identity/bvn', { bvn });
          if (response.data.status === true || response.data.status === 'success') {
              return { success: true, data: response.data.data };
          }
          return { success: false, message: response.data.message || 'BVN Verification failed' };
      } catch (error: any) {
          console.error('PocketFi BVN Error:', error.response?.data || error.message);
          return { success: false, message: error.response?.data?.message || error.message };
      }
  }

  async verifyNIN(nin: string): Promise<{ success: boolean; data?: any; message?: string }> {
      try {
          const response = await this.api.post('/identity/nin', { nin });
          if (response.data.status === true || response.data.status === 'success') {
              return { success: true, data: response.data.data };
          }
          return { success: false, message: response.data.message || 'NIN Verification failed' };
      } catch (error: any) {
          console.error('PocketFi NIN Error:', error.response?.data || error.message);
          return { success: false, message: error.response?.data?.message || error.message };
      }
  }
}
