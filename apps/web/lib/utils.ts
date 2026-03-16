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
