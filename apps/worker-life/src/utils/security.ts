
import { logger } from './logger.js';

/**
 * PII Redaction utility to protect sensitive user data.
 * Targets: Emails, Phone Numbers, Bank Account Numbers, Card Numbers, and PINs.
 * Refined to avoid over-redaction of conversational numbers (quantities, dates).
 */
export const redactPII = (text: string): string => {
  if (!text) return '';

  let redacted = text;

  // 1. Email Redaction
  redacted = redacted.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '[EMAIL]');
  
  // 2. Date Preservation: Temporarily mask YYYY-MM-DD or DD/MM/YYYY to avoid phone/account redaction
  const datePlaceholder = '___DATE_VAL___';
  const dates: string[] = [];
  redacted = redacted.replace(/\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b/g, (match) => {
    dates.push(match);
    return `${datePlaceholder}${dates.length - 1}__`;
  });

  // 3. Phone Numbers: Targeted Nigerian & International formats
  // Only redact if it looks like a phone number and isn't just a large quantity
  redacted = redacted.replace(/(?:\+?234|0)[-\s]?(?:70|80|81|90|91)\d[-\s]?\d{3}[-\s]?\d{4}\b/g, '[PHONE REDACTED]');
  
  // 4. Bank Account Numbers: Strictly 10 digits near keywords
  // Keywords: account, acct, bank, nuban, acc, "send to", "transfer to"
  const accountKeywords = /(?:account|acct|bank|nuban|acc|send\s+to|transfer\s+to|pay\s+into)\s*(?:no|number|is)?\s*[:=-]?\s*/gi;
  redacted = redacted.replace(new RegExp(accountKeywords.source + '(\\b\\d{10}\\b)', 'gi'), (match, p1) => match.replace(p1, '[ACCOUNT REDACTED]'));
  
  // 5. Credit/Debit Cards: 16-19 digits with separators
  redacted = redacted.replace(/\b(?:\d{4}[-\s]?){3}\d{4,7}\b/g, '[CARD REDACTED]');

  // 6. PINs and OTPs: 4-6 digits strictly associated with security keywords
  const securityKeywords = /(?:pin|code|otp|password|secret|auth|token)/gi;
  // Case A: Keyword before number
  redacted = redacted.replace(new RegExp('(' + securityKeywords.source + ')(\\s*(?:is\s*)?[:=-]*\\s*)(\\b\\d{4,6}\\b)', 'gi'), '$1$2[PIN/OTP REDACTED]');
  // Case B: Number before keyword
  redacted = redacted.replace(new RegExp('(\\b\\d{4,6}\\b)(\\s*(?:is\\s*(?:my\s*)?)?(' + securityKeywords.source + '))', 'gi'), '[PIN/OTP REDACTED]$2');
  
  // 7. Restore Dates
  dates.forEach((date, i) => {
    redacted = redacted.replace(`${datePlaceholder}${i}__`, date);
  });

  return redacted;
};

/**
 * Recursively redacts PII from tool arguments.
 */
export const redactToolArguments = (args: any): any => {
  if (typeof args === 'string') {
    return redactPII(args);
  }
  if (Array.isArray(args)) {
    return args.map(redactToolArguments);
  }
  if (args !== null && typeof args === 'object') {
    const redactedObj: Record<string, any> = {};
    for (const key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key)) {
        redactedObj[key] = redactToolArguments(args[key]);
      }
    }
    return redactedObj;
  }
  return args;
};
