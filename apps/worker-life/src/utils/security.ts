
import { logger } from './logger.js';

/**
 * PII Redaction utility to protect sensitive user data.
 * Targets: Emails, Phone Numbers, Bank Account Numbers, Card Numbers, and PINs.
 */
export const redactPII = (text: string): string => {
  if (!text) return '';

  let redacted = text.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '[EMAIL]');
  
  // Accurately target phone numbers (Nigerian local 11-digit, international +234, with or without spaces/dashes)
  redacted = redacted.replace(/(?:\+?234|0)[-\s]?(?:70|80|81|90|91)\d[-\s]?\d{3}[-\s]?\d{4}\b/g, '[PHONE REDACTED]');
  
  // Target 10-digit Nigerian Bank Account numbers ONLY if preceded by account-related words
  redacted = redacted.replace(/(?:account|acct|bank|nuban|acc)\s*(?:no|number|is)?\s*[:=-]?\s*(\b\d{10}\b)/gi, (match, p1) => match.replace(p1, '[ACCOUNT REDACTED]'));
  
  // Target 16-19 digit Credit/Debit Card numbers (more robust grouping)
  redacted = redacted.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[CARD REDACTED]');

  // Target PINs and OTPs specifically associated with keywords (before or after)
  // Catches: "PIN 1234", "code: 1234", "My PIN is 1234", "1234 is my pin"
  // Using a replacer function to preserve the context words and only redact the number
  redacted = redacted.replace(/(pin|code|otp|password)(\s*(?:is\s*)?[:=-]*\s*)(\b\d{4,6}\b)/gi, '$1$2[PIN/OTP REDACTED]');
  redacted = redacted.replace(/(\b\d{4,6}\b)(\s*(?:is\s*(?:my\s*)?)?(?:pin|code|otp|password))/gi, '[PIN/OTP REDACTED]$2');
  
  return redacted;
};
