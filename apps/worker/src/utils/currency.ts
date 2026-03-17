export function getPriceGuardRegex(symbol: string, code: string): RegExp {
  // Escaping the symbol for regex safety (e.g., $ becomes \$)
  const safeSymbol = symbol || (code === 'NGN' ? '₦' : '$');
  const escapedSymbol = safeSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Dynamic Regex Construction
  // 1. Symbol + Amount (e.g. $50, ₦50)
  // 2. Amount + Code/Name (e.g. 50 USD, 50 Naira)
  // 3. Amount + 'k' (Thousands) (e.g. 50k)
  // 4. Amount + 'm' (Millions) (e.g. 50m)
  
  // The 'k' and 'm' patterns are relatively universal in English-speaking contexts
  // but we might want to gate them if needed. For now, we keep them global.
  
  const safeCode = code || 'NGN';
  const firstChar = safeCode.charAt(0);

  return new RegExp(
    `(?:(${escapedSymbol}|${safeCode}|\\b${firstChar}\\b)\\s*?(\\d[\\d,.]*))` + // Symbol/Code Prefix
    `|(\\d[\\d,.]*)\\s*(${safeCode}|${escapedSymbol})` + // Code/Symbol Suffix
    `|(\\b\\d+(?:\\.\\d+)?[kK]\\b)` + // 'k' notation
    `|(\\b\\d+(?:\\.\\d+)?[mM]\\b)`, // 'm' notation
    'gi'
  );
}

export function formatCurrency(amountMajor: number, locale: string = 'en-NG', currencyCode: string = 'NGN'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2
    }).format(amountMajor);
  } catch (e) {
    // Fallback if locale/currency is invalid
    return `${currencyCode} ${amountMajor.toLocaleString()}`;
  }
}

/**
 * Robustly parses a price string into a number.
 * Handles:
 * - "1,000.00" (En-style)
 * - "1.000,00" (Eu-style)
 * - "50k", "1m"
 */
export function parsePrice(input: string, symbol: string, code: string): number | null {
  // 1. Strip symbols, codes, and whitespace
  let clean = input.replace(new RegExp(`[${symbol}${code}\\s#]`, 'gi'), '').toLowerCase();
  
  // 2. Handle 'k' and 'm' multipliers
  let multiplier = 1;
  if (clean.endsWith('k')) {
    multiplier = 1000;
    clean = clean.slice(0, -1);
  } else if (clean.endsWith('m')) {
    multiplier = 1000000;
    clean = clean.slice(0, -1);
  }

  // 3. Detect European style (dot for thousands, comma for decimal) vs English style
  // If there's a comma followed by 2 digits at the end, it's likely a decimal
  if (/,(\d{2})$/.test(clean)) {
    // Eu-style: 1.250,50 -> 1250.50
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    // En-style: 1,250.50 -> 1250.50
    clean = clean.replace(/,/g, '');
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) ? null : parsed * multiplier;
}
