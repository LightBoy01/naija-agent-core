import { SectorPack } from '@naija-agent/types';
import { getCommercePack } from './commerce/index.js';
import { getHealthPack } from './health/index.js';
import { getPropertyPack } from './property/index.js';
import { getLegalPack } from './legal/index.js';
import { CountryCode } from 'libphonenumber-js';

export function getSectorPack(sectorId: string, currency: { code: string, symbol: string }, region: CountryCode = 'NG'): SectorPack {
  const sid = sectorId.toLowerCase();
  switch (sid) {
    case 'commerce':
    case 'retail':
    case 'commercepack':
      return getCommercePack(currency, region);
    
    case 'health':
    case 'clinic':
    case 'healthpack':
      return getHealthPack(currency, region);

    case 'property':
    case 'real_estate':
    case 'propertypack':
      return getPropertyPack(currency, region);

    case 'legal':
    case 'law':
    case 'legalpack':
      return getLegalPack(currency, region);

    default:
      // Fallback to Commerce if unknown (or a generic 'base' pack in future)
      return getCommercePack(currency, region);
  }
}
