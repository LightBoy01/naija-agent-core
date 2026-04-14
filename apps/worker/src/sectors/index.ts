import { SectorPack } from '@naija-agent/types';
import { getCommercePack } from './commerce/index.js';
import { getHealthPack } from './health/index.js';
import { getPropertyPack } from './property/index.js';
import { CountryCode } from 'libphonenumber-js';

export function getSectorPack(sectorId: string, currency: { code: string, symbol: string }, region: CountryCode = 'NG'): SectorPack {
  switch (sectorId) {
    case 'commerce':
    case 'retail':
      return getCommercePack(currency, region);
    
    case 'health':
    case 'clinic':
      return getHealthPack(currency, region);

    case 'property':
    case 'real_estate':
      return getPropertyPack(currency, region);

    default:
      // Fallback to Commerce if unknown (or a generic 'base' pack in future)
      return getCommercePack(currency, region);
  }
}
