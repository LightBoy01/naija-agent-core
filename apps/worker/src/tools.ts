import { AUTH_REQUIRED_TOOLS } from './tools/definitions.js';
import { CountryCode } from 'libphonenumber-js';
import { getPhoneExample } from './utils/phone.js';
import { SectorPack } from '@naija-agent/types';
import { getLegacyCommerceTools } from './sectors/commerce/legacyTools.js';

// Import Modular Tools
import { COMMERCE_TOOLS } from './tools/commerce.js';
import { ADMIN_TOOLS } from './tools/admin.js';
import { INVENTORY_TOOLS } from './tools/inventory.js';
import { CONTENT_TOOLS } from './tools/content.js';
import { SYSTEM_TOOLS } from './tools/system.js';

/**
 * Defines which tools require 4-digit PIN authentication (Boss Only).
 */
export const PIN_PROTECTED_TOOLS = AUTH_REQUIRED_TOOLS;

export function getTenantTools(
  isAdmin: boolean, 
  isStaff: boolean, 
  isMaster: boolean, 
  hasPayment: boolean,
  orgCurrency: { code: string, symbol: string, locale: string } = { code: 'NGN', symbol: '₦', locale: 'en-NG' },
  orgRegion: CountryCode = 'NG',
  sectorPack?: SectorPack,
  isLegacy: boolean = false
): any[] {
  const allFunctionDeclarations: any[] = [];
  const isManager = isAdmin || isStaff;
  const phoneExample = getPhoneExample(orgRegion);

  // --- SECTOR SPECIFIC TOOLS ---
  if (sectorPack && sectorPack.tools) {
    for (const tool of sectorPack.tools) {
      if ('functionDeclarations' in tool && tool.functionDeclarations) {
        allFunctionDeclarations.push(...tool.functionDeclarations);
      }
    }
  }

  // --- BASE TOOLS (Universal) ---
  
  // 1. Commerce & Payments
  allFunctionDeclarations.push(...COMMERCE_TOOLS);

  // 2. Content & AI
  allFunctionDeclarations.push(...CONTENT_TOOLS);

  // --- LEGACY & FALLBACK TOOLS ---
  if (!sectorPack || isLegacy) {
      const legacyTools = getLegacyCommerceTools(isAdmin, isStaff, orgCurrency, orgRegion);
      allFunctionDeclarations.push(...legacyTools);
  }

  // 3. Manager Tools (BOSS & STAFF)
  if (isManager) {
    allFunctionDeclarations.push(...ADMIN_TOOLS);
    allFunctionDeclarations.push(...INVENTORY_TOOLS);
  }

  // 4. Master Tools (Sovereign Only)
  if (isMaster) {
    allFunctionDeclarations.push(...SYSTEM_TOOLS);
  }

  return [{ functionDeclarations: allFunctionDeclarations }];
}
