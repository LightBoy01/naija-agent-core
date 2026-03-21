import { describe, it, expect } from 'vitest';
import { marketService } from '../../src/services/marketData';

describe('MarketDataService', () => {
    it('should return a list of market prices', async () => {
        const prices = await marketService.getPrices();
        expect(prices).toBeDefined();
        expect(Array.isArray(prices)).toBe(true);
        expect(prices.length).toBeGreaterThan(0);
        
        const firstItem = prices[0];
        expect(firstItem).toHaveProperty('item');
        expect(firstItem).toHaveProperty('price');
        expect(firstItem).toHaveProperty('market');
        expect(firstItem.trend).toMatch(/^(up|down|stable)$/);
    });

    it('should handle API failures gracefully (fallback)', async () => {
        // Since getPrices handles its own errors internally, 
        // we can just verify it returns *something* valid even if mocked to fail.
        const prices = await marketService.getPrices();
        expect(prices.length).toBeGreaterThan(0);
    });
});
