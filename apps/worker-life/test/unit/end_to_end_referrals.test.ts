import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCommissionsTool } from '../../src/tools/finance/commissions.js';

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

vi.mock('@naija-agent/database', () => ({
    claimCommissions: vi.fn(),
    getPartnerStats: vi.fn()
}));

import { claimCommissions, getPartnerStats } from '@naija-agent/database';

describe('End-to-End Partnership & Referral Workflows', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Zynux B2B Referral Program (30% RevShare)', () => {
        it('should successfully generate a referral link with the correct Master Bot WhatsApp URL', async () => {
            const userId = '2349000000000';
            const result = await executeCommissionsTool('generate_referral_link', { action: 'generate', userId });
            
            expect(result).toContain('https://wa.me/2347011925076');
            expect(result).toContain('Ref%3A%202349000000000');
            expect(result).toContain('30%');
        });

        it('should retrieve partner stats from the database and format them for Aelixxr', async () => {
            const userId = '2349000000000';
            
            (getPartnerStats as any).mockResolvedValue({
                totalReferrals: 5,
                activeReferrals: 3,
                totalEarnedKobo: 5000000,
                totalPendingKobo: 1000000,
                totalClearedKobo: 4000000,
                referrals: [
                    { id: 'r1', orgName: 'Bims Gadgets', orgStatus: 'ACTIVE', commissionEarnedKobo: 2000000, createdAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000), isActive: true },
                    { id: 'r2', orgName: 'Mama Put Restaurant', orgStatus: 'ACTIVE', commissionEarnedKobo: 1500000, createdAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000), isActive: true },
                    { id: 'r3', orgName: 'Auto Spare Parts NG', orgStatus: 'TRIAL', commissionEarnedKobo: 500000, createdAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000), isActive: true },
                    { id: 'r4', orgName: 'City Pharmacy', orgStatus: 'ACTIVE', commissionEarnedKobo: 800000, createdAt: new Date(), expiresAt: new Date(Date.now() - 10 * 86400000), isActive: false },
                    { id: 'r5', orgName: 'Tunde Cakes', orgStatus: 'SUSPENDED', commissionEarnedKobo: 200000, createdAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000), isActive: false }
                ]
            });

            const result = await executeCommissionsTool('get_partner_stats', { action: 'get_stats', userId });
            
            expect(result).toContain('Total Referrals: 5');
            expect(result).toContain('Active (Earning) Referrals: 3');
            expect(result).toContain('Total Earned All-Time: 50000.00 NGN');
        });

        it('should successfully claim cleared commissions and simulate Vault sweep', async () => {
            const userId = '2349000000000';
            
            (claimCommissions as any).mockResolvedValue({
                success: true,
                message: 'Successfully claimed 40000.00 NGN to vault.',
                amountClaimed: 4000000
            });

            const result = await executeCommissionsTool('claim_commissions', { action: 'claim', userId });
            
            expect(claimCommissions).toHaveBeenCalledWith(userId);
            expect(result).toContain('40000 NGN has been cleared');
            expect(result).toContain('withdraw to your bank');
        });

        it('should handle claim rejection when no cleared commissions exist', async () => {
            const userId = '2349000000000';
            
            (claimCommissions as any).mockResolvedValue({
                success: false,
                message: 'No cleared commissions available to claim.',
                amountClaimed: 0
            });

            const result = await executeCommissionsTool('claim_commissions', { action: 'claim', userId });
            
            expect(claimCommissions).toHaveBeenCalledWith(userId);
            expect(result).toContain('No commissions available to claim right now');
        });
    });

    describe('Ecosystem Fixes — Commission Sweep', () => {
        it('should expose claim_commissions as a user-facing tool alongside auto-sweep', async () => {
            // Manual claim still works for users who don't want to wait for the cron
            const userId = '2349000000000';
            
            (claimCommissions as any).mockResolvedValue({
                success: true,
                message: 'Successfully claimed 5000.00 NGN to vault.',
                amountClaimed: 500000
            });

            const result = await executeCommissionsTool('claim_commissions', { action: 'claim', userId });
            expect(result).toContain('5000 NGN has been cleared');
        });
    });
});

// Standalone unit tests for referral detection patterns
// These test the regexes used in the onboarding prospect flow

describe('Referral Detection Patterns', () => {
    describe('Exact URL prefix match (primary path)', () => {
        const urlPattern = /I_want_AI_for_my_business_(\d+)/;
        
        it('should extract referrer phone from WhatsApp URL prefix', () => {
            const match = 'I_want_AI_for_my_business_2348000000000'.match(urlPattern);
            expect(match?.[1]).toBe('2348000000000');
        });
    });

    describe('Natural language fallback (WhatsApp transformation recovery)', () => {
        const intentPattern = /Ref:\s*(\+?\d+)|(?:referred|invited)\s+me/i;
        const phonePattern = /(\+?\d{10,14})/;
        
        it('should detect Ref: prefix with phone number', () => {
            expect(intentPattern.test('Ref: 08012345678')).toBe(true);
            expect(intentPattern.test('my friend referred me here')).toBe(true);
            expect(intentPattern.test('someone invited me')).toBe(true);
        });

        it('should NOT false-match on unrelated messages', () => {
            expect(intentPattern.test('hello')).toBe(false);
            expect(intentPattern.test('someone sent me a picture')).toBe(false);
            expect(intentPattern.test('my friend told me about the weather')).toBe(false);
        });

        it('should extract phone numbers from referral messages', () => {
            const phone = 'my friend referred me to you, +2348012345678'.match(phonePattern);
            expect(phone?.[0]).toBe('+2348012345678');
            
            const localPhone = 'Ref: 08012345678 for the business'.match(phonePattern);
            expect(localPhone?.[0]).toBe('08012345678');
        });
    });
});
