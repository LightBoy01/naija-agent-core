import { TerminalAfricaProvider } from './terminal';

export interface ShippingRate {
  provider: string;
  service: string;
  amount: number;
  currency: string;
  deliveryTime: string;
  rateId: string;
}

export interface TrackingStatus {
  status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  location: string;
  description: string;
  timestamp: string;
}

export interface LogisticsProvider {
  getRates(params: {
    origin: string;
    destination: string;
    weightKg: number;
    items?: string;
  }): Promise<ShippingRate[]>;
  track(trackingNumber: string): Promise<TrackingStatus | null>;
}

export class MockLogisticsProvider implements LogisticsProvider {
  async getRates(params: { origin: string; destination: string; weightKg: number }): Promise<ShippingRate[]> {
    return [
      {
        provider: 'GIGL',
        service: 'Regular',
        amount: 3500,
        currency: 'NGN',
        deliveryTime: '2-3 Days',
        rateId: 'MOCK-1'
      },
      {
        provider: 'DHL',
        service: 'Express',
        amount: 8500,
        currency: 'NGN',
        deliveryTime: 'Next Day',
        rateId: 'MOCK-2'
      }
    ];
  }

  async track(trackingNumber: string): Promise<TrackingStatus | null> {
    return {
      status: 'in_transit',
      location: 'Lagos Hub',
      description: 'Package being sorted for delivery.',
      timestamp: new Date().toISOString()
    };
  }
}

export { TerminalAfricaProvider };

export function getLogisticsProvider(type: 'terminal' | 'mock', apiKey?: string): LogisticsProvider {
  if (type === 'terminal') {
    if (!apiKey) throw new Error('Terminal Africa API Key required');
    return new TerminalAfricaProvider(apiKey);
  }
  return new MockLogisticsProvider();
}
