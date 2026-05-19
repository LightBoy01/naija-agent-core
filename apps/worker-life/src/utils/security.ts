
import { logger } from './logger.js';

/**
 * PII Redaction utility to protect sensitive user data.
 * Targets: Emails, Phone Numbers, Bank Account Numbers, Card Numbers, and PINs.
 */
export const redactPII = (text: string): string => {
  if (!text) return '';

  let redacted = text.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '[EMAIL]');
  
  // Accurately target phone numbers (Nigerian local, international, with or without spaces/dashes)
  redacted = redacted.replace(/(?:\+?234|0)[-\s]?(?:70|80|81|90|91)[-\s]?\d{3}[-\s]?\d{4}/g, '[PHONE REDACTED]');
  
  // Target 10-digit Nigerian Bank Account numbers
  redacted = redacted.replace(/\b\d{10}\b/g, '[ACCOUNT REDACTED]');
  
  // Target 16-19 digit Credit/Debit Card numbers
  redacted = redacted.replace(/\b(?:\d{4}[-\s]?){3,4}\d{1,3}\b/g, '[CARD REDACTED]');

  // Target PINs and OTPs specifically associated with keywords (before or after)
  // Catches: "PIN 1234", "code: 1234", "My PIN is 1234", "1234 is my pin"
  redacted = redacted.replace(/(?:(?:pin|code|otp|password)\s*(?:is\s*)?[:=-]*\s*\b\d{4,6}\b)|\b\d{4,6}\b\s*(?:is\s*(?:my\s*)?(?:pin|code|otp|password))/gi, '[PIN/OTP REDACTED]');
  
  return redacted;
};
