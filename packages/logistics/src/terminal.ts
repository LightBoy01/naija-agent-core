import axios from 'axios';
import { LogisticsProvider, ShippingRate, TrackingStatus } from './index';

export class TerminalAfricaProvider implements LogisticsProvider {
  private apiKey: string;
  private baseUrl = 'https://api.terminal.africa/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getRates(params: { origin: string; destination: string; weightKg: number }): Promise<ShippingRate[]> {
    try {
      const response = await axios.post(`${this.baseUrl}/rates`, {
        origin: params.origin,
        destination: params.destination,
        weight: params.weightKg,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.status) return [];

      return response.data.data.map((rate: any) => ({
        provider: rate.carrier_name,
        service: rate.service_name,
        amount: rate.total_fee,
        currency: rate.currency,
        deliveryTime: rate.delivery_time,
        rateId: rate.rate_id
      }));
    } catch (e: any) {
      console.error('Terminal Africa Rates Error:', e.response?.data || e.message);
      return [];
    }
  }

  async track(trackingNumber: string): Promise<TrackingStatus | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/track/${trackingNumber}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.data.status) return null;

      const data = response.data.data;
      return {
        status: this.mapStatus(data.status),
        location: data.current_location || 'Unknown',
        description: data.description || 'No description available.',
        timestamp: data.updated_at || new Date().toISOString()
      };
    } catch (e: any) {
      console.error('Terminal Africa Tracking Error:', e.response?.data || e.message);
      return null;
    }
  }

  private mapStatus(status: string): TrackingStatus['status'] {
    const s = status.toLowerCase();
    if (s.includes('delivered')) return 'delivered';
    if (s.includes('failed') || s.includes('returned')) return 'failed';
    if (s.includes('transit') || s.includes('out')) return 'in_transit';
    return 'pending';
  }
}
