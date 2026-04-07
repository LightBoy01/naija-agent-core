import { describe, it, expect } from 'vitest';
import { parsePrice, formatCurrency, getPriceGuardRegex } from './currency.js';

describe('Currency Utilities', () => {
  describe('parsePrice', () => {
    it('should parse standard numeric strings', () => {
      expect(parsePrice('5000', '₦', 'NGN')).toBe(5000);
      expect(parsePrice('150.50', '$', 'USD')).toBe(150.5);
    });

    it('should handle commas as thousands separators', () => {
      expect(parsePrice('5,000', '₦', 'NGN')).toBe(5000);
      expect(parsePrice('1,500,000.50', '₦', 'NGN')).toBe(1500000.5);
    });

    it('should handle k and m suffixes (case-insensitive)', () => {
      expect(parsePrice('5k', '₦', 'NGN')).toBe(5000);
      expect(parsePrice('5.5K', '₦', 'NGN')).toBe(5500);
      expect(parsePrice('2m', '₦', 'NGN')).toBe(2000000);
      expect(parsePrice('1.5M', '₦', 'NGN')).toBe(1500000);
    });

    it('should strip out currency symbols and codes', () => {
      expect(parsePrice('₦5000', '₦', 'NGN')).toBe(5000);
      expect(parsePrice('NGN 5000', '₦', 'NGN')).toBe(5000);
      expect(parsePrice('$150', '$', 'USD')).toBe(150);
      expect(parsePrice('USD 150', '$', 'USD')).toBe(150);
    });

    it('should return null for invalid inputs', () => {
      expect(parsePrice('invalid', '₦', 'NGN')).toBeNull();
      expect(parsePrice('₦', '₦', 'NGN')).toBeNull();
    });
  });

  describe('formatCurrency', () => {
    it('should format Nigerian Naira correctly', () => {
      expect(formatCurrency(5000, 'en-NG', 'NGN')).toBe('₦5,000');
    });

    it('should format US Dollars correctly', () => {
      expect(formatCurrency(150.5, 'en-US', 'USD')).toBe('$150.5');
    });

    it('should handle zero gracefully', () => {
      expect(formatCurrency(0, 'en-NG', 'NGN')).toBe('₦0');
    });

    it('should correctly render Naira from internal Kobo balances', () => {
      const balanceInKobo = 500000; // 5,000 Naira
      expect(formatCurrency(balanceInKobo / 100, 'en-NG', 'NGN')).toBe('₦5,000');
    });
  });

  describe('getPriceGuardRegex', () => {
    it('should match currency strings with symbols', () => {
      const regex = getPriceGuardRegex('₦', 'NGN');
      expect('I paid ₦5000 for this.').toMatch(regex);
      expect('The cost is NGN 15,000.').toMatch(regex);
    });

    it('should match shorthand notations', () => {
      const regex = getPriceGuardRegex('₦', 'NGN');
      expect('Please send 5k to me.').toMatch(regex);
      expect('The deal is 2m.').toMatch(regex);
    });
  });
});
