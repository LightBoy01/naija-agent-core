export function getPriceGuardRegex(symbol: string, code: string): RegExp {
  const safeSymbol = symbol || (code === 'NGN' ? '₦' : '$');
  const escapedSymbol = safeSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeCode = code || 'NGN';

  return new RegExp(
    `(${escapedSymbol}|${safeCode})\\s*?(\\d[\\d,.]*\\d|\\d)` + 
    `|(\\d[\\d,.]*\\d|\\d)\\s*?(${safeCode}|${escapedSymbol}|Naira|Dollars|Pounds)` + 
    `|(\\b\\d+(?:\\.\\d+)?[kK]\\b)` + 
    `|(\\b\\d+(?:\\.\\d+)?[mM]\\b)`, 
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
    return `${currencyCode} ${amountMajor.toLocaleString()}`;
  }
}

export function parsePrice(input: string, symbol: string, code: string): number | null {
  let clean = input.replace(new RegExp(`[${symbol}${code}\\s#]`, 'gi'), '').toLowerCase();
  
  let multiplier = 1;
  if (clean.endsWith('k')) {
    multiplier = 1000;
    clean = clean.slice(0, -1);
  } else if (clean.endsWith('m')) {
    multiplier = 1000000;
    clean = clean.slice(0, -1);
  }

  if (/,(\d{2})$/.test(clean)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(/,/g, '');
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) ? null : parsed * multiplier;
}
