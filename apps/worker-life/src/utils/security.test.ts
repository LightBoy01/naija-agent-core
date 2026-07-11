import { describe, it, expect } from 'vitest';
import { redactPII, redactToolArguments } from './security.js';

describe('Security Redaction', () => {
  describe('redactPII', () => {
    it('should redact 10-digit account numbers', () => {
      const text = 'Transfer to account number 0123456789 pls';
      expect(redactPII(text)).toContain('[ACCOUNT REDACTED]');
      expect(redactPII(text)).not.toContain('0123456789');
    });

    it('should redact 4-digit PINs', () => {
      const text = 'My secret pin is 1234';
      expect(redactPII(text)).toContain('[PIN/OTP REDACTED]');
      expect(redactPII(text)).not.toContain('1234');
    });

    it('should not redact safe conversational numbers', () => {
      const text = 'I bought 1234 apples in 2026';
      const result = redactPII(text);
      expect(result).toContain('1234');
      expect(result).toContain('2026');
    });
  });

  describe('redactToolArguments', () => {
    it('should recursively redact PII in objects', () => {
      const args = {
        amount: 5000,
        metadata: {
          note: 'My pin is 5555',
          account: 'Send to bank 0123456789',
          items: ['safe item', 'pin 1234']
        }
      };

      const redacted = redactToolArguments(args);
      
      expect(redacted.amount).toBe(5000);
      expect(redacted.metadata.note).toContain('[PIN/OTP REDACTED]');
      expect(redacted.metadata.note).not.toContain('5555');
      expect(redacted.metadata.account).toContain('[ACCOUNT REDACTED]');
      expect(redacted.metadata.account).not.toContain('0123456789');
      expect(redacted.metadata.items[1]).toContain('[PIN/OTP REDACTED]');
      expect(redacted.metadata.items[1]).not.toContain('1234');
    });
  });
});
