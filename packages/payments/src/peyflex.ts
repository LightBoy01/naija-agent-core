import axios, { AxiosInstance } from 'axios';

export interface PeyflexResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  raw?: any;
}

export class PeyflexProvider {
  private api: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.api = axios.create({
      baseURL: 'https://client.peyflex.com.ng',
      headers: {
        Authorization: `Token ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: 30000 // 30s timeout for stability
    });
  }

  /**
   * Verify an electricity meter number
   */
  async verifyMeter(meter: string, plan: string, type: 'prepaid' | 'postpaid'): Promise<PeyflexResponse<{ customerName: string }>> {
    try {
      // Endpoint doesn't require auth according to docs, but axios will include it anyway (safe)
      const response = await this.api.get(`/api/electricity/verify/`, {
        params: {
          identifier: 'electricity',
          meter,
          plan,
          type
        }
      });
      if (response.data.status === 'SUCCESS' || response.data.customer_name) {
        return { success: true, data: { customerName: response.data.customer_name }, raw: response.data };
      }
      return { success: false, message: response.data.message || 'Verification failed' };
    } catch (error: any) {
      console.error('Peyflex verifyMeter Error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  /**
   * Purchase Recharge Card E-Pins
   */
  async purchaseRechargeCard(network: string, amount: number, quantity: number, brandName: string): Promise<PeyflexResponse<{ reference: string, cards: Array<{pin: string, serial: string}> }>> {
    try {
      const response = await this.api.post('/api/rc/purchase/', {
        network: network.toUpperCase(),
        amount: amount,
        quantity: quantity,
        pin: "1234", // Required by API example
        brand_name: brandName
      });

      if (response.data.success || response.data.order?.status === 'SUCCESS') {
        return { 
          success: true, 
          data: {
             reference: response.data.order?.reference,
             cards: response.data.cards || []
          },
          raw: response.data
        };
      }
      return { success: false, message: response.data.message || 'Purchase failed' };
    } catch (error: any) {
      console.error('Peyflex purchaseRechargeCard Error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }

  /**
   * Purchase Direct Airtime or Data
   */
  async purchaseAirtimeData(network: string, amount: number, type: 'airtime' | 'data', phone: string): Promise<PeyflexResponse<any>> {
    try {
      // NOTE: This uses a placeholder endpoint until the exact Airtime/Data endpoint is confirmed.
      // Usually it's something like /api/vtu/purchase/
      const response = await this.api.post('/api/vtu/purchase/', {
        network: network.toUpperCase(),
        amount: amount,
        phone: phone,
        type: type
      });
      return { success: true, data: response.data, raw: response.data };
    } catch (error: any) {
      console.error('Peyflex purchaseAirtimeData Error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || error.message };
    }
  }
}
