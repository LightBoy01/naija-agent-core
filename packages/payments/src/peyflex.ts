import axios, { AxiosInstance } from 'axios';

export interface PeyflexResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  raw?: any;
}

export class PeyflexProvider {
  private api: AxiosInstance;
  private airtimeClient: AxiosInstance | null = null;
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
      timeout: 30000
    });
  }

  /** Lazy-initialize the airtime client (separate host: portal.peyflex.com.ng) */
  private getAirtimeClient(): AxiosInstance {
    if (!this.airtimeClient) {
      this.airtimeClient = axios.create({
        baseURL: 'https://portal.peyflex.com.ng',
        timeout: 30000,
        headers: {
          Authorization: this.token,
          'source-domain': process.env.PEYFLEX_SOURCE_DOMAIN || 'https://naijaagent.com',
          Accept: 'application/json'
        }
      });
    }
    return this.airtimeClient;
  }

  /** Map internal network codes to Peyflex portal API network params */
  private mapNetwork(network: string, type: 'airtime' | 'data'): string {
    const upper = network.toUpperCase();
    if (type === 'airtime') {
      const airtimeMap: Record<string, string> = {
        'MTN': 'mtn_airtime',
        'AIRTEL': 'airtel_airtime',
        'GLO': 'glo_airtime',
        '9MOBILE': '9mobile_airtime'
      };
      return airtimeMap[upper] || `${network.toLowerCase()}_airtime`;
    }
    return `${network.toLowerCase()}_data`;
  }

  /**
   * Verify an electricity meter number
   */
  async verifyMeter(meter: string, plan: string, type: 'prepaid' | 'postpaid'): Promise<PeyflexResponse<{ customerName: string }>> {
    try {
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
        pin: "1234", // Required by API docs — static field, not a credential
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
   * Purchase Direct Airtime or Data via Peyflex Portal API.
   * Endpoint: POST https://portal.peyflex.com.ng/api/v1/airtime?format=json&phone=X&amount=X&network=X
   * Note: Data bundle vending may not be supported by this endpoint — check Peyflex for a separate data API.
   */
  async purchaseAirtimeData(network: string, amount: number, type: 'airtime' | 'data', phone: string): Promise<PeyflexResponse<any>> {
    try {
      const networkParam = this.mapNetwork(network, type);
      const params: Record<string, string | number> = {
        format: 'json',
        phone,
        amount,
        network: networkParam
      };
      if (this.token) params['api-token'] = this.token;

      const response = await this.getAirtimeClient().post('/api/v1/airtime', null, { params });

      // Portal API returns plain JSON — success may be indicated by status field or absence of error
      if (response.data) {
        return {
          success: response.data.status === 'success' || response.data.status === 201 || response.data.success !== false,
          data: response.data,
          raw: response.data,
          message: response.data.message
        };
      }
      return { success: false, message: 'Empty response from Peyflex airtime API', raw: response.data };
    } catch (error: any) {
      console.error('Peyflex purchaseAirtimeData Error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || error.message, raw: error.response?.data };
    }
  }
}
