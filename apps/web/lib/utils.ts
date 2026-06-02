import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatTimestamp(ts: any): Date {
  if (!ts) return new Date();
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate();
  }
  // Handle plain object { seconds, nanoseconds }
  if (typeof ts.seconds === 'number') {
    return new Date(ts.seconds * 1000);
  }
  // Handle string/number/Date
  return new Date(ts);
}

export function formatCurrency(amount: number, locale = 'en-NG', currencyCode = 'NGN', symbol = '₦') {
  try {
     return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
     }).format(amount);
  } catch {
     return `${symbol}${amount.toLocaleString()}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeOrgForFrontend(org: any) {
  if (!org) return null;
  const { config, ...rest } = org;
  if (!config) return rest;

  // Strip sensitive fields from config
  const safeConfig = { ...config };
  const sensitiveFields = ['whatsappToken', 'appSecret', 'bridgeSecret', 'adminPin', 'mfaCode'];
  sensitiveFields.forEach(field => delete safeConfig[field]);

  const safePayment = config.payment 
    ? { provider: config.payment.provider, publicKey: config.payment.publicKey } 
    : undefined;

  return {
    ...rest,
    config: {
      ...safeConfig,
      payment: safePayment
    }
  };
}

/**
 * Resolves a storage path or pseudo-URL (like r2://) into a usable browser URL.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  // 1. Handle Cloudflare R2 pseudo-URLs
  if (url.startsWith('r2://')) {
    const publicDomain = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN;
    if (publicDomain) {
      const path = url.split('/').slice(3).join('/'); // Remove r2://bucket/
      const baseUrl = publicDomain.startsWith('http') ? publicDomain : `https://${publicDomain}`;
      return `${baseUrl}/${path}`;
    }
    // Fallback if no public domain (though it might still be broken in browser)
    return url;
  }

  // 2. Already a full URL
  if (url.startsWith('http')) {
    return url;
  }

  // 3. Fallback/Default
  return url;
}
