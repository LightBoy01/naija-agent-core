import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCommissionsTool } from '../../src/tools/finance/commissions.js';

// --- MOCKS ---

// Mock Logger
vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock Database (Since the logic sits in @naija-agent/database)
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
            
            // Assert the link contains the correct Master Bot and the referrer ID
            expect(result).toContain('https://wa.me/2347011925076');
            expect(result).toContain('Ref%3A%202349000000000');
            expect(result).toContain('30%'); // Assert Aelixxr correctly pitches the 30% revshare
        });

        it('should retrieve partner stats from the database and format them for Aelixxr', async () => {
            const userId = '2349000000000';
            
            // Mock the DB response for partner stats
            (getPartnerStats as any).mockResolvedValue({
                totalReferrals: 5,
                activeReferrals: 3,
                totalEarnedKobo: 5000000, // 50,000 NGN
                totalPendingKobo: 1000000, // 10,000 NGN
                totalClearedKobo: 4000000  // 40,000 NGN
            });

            const result = await executeCommissionsTool('get_partner_stats', { action: 'get_stats', userId });
            
            // Assert that the formatting divides kobo by 100 correctly
            expect(result).toContain('Total Referrals: 5');
            expect(result).toContain('Active (Earning) Referrals: 3');
            expect(result).toContain('Total Earned All-Time: 50000.00 NGN');
            expect(result).toContain('Pending (Under 7 Days): 10000.00 NGN');
            expect(result).toContain('Cleared (Ready to Claim): 40000.00 NGN');
        });

        it('should successfully claim cleared commissions and simulate Vault sweep', async () => {
            const userId = '2349000000000';
            
            // Mock a successful claim from the DB
            (claimCommissions as any).mockResolvedValue({
                success: true,
                message: 'Successfully claimed 40000.00 NGN to vault.',
                amountClaimed: 4000000 // 40,000 NGN in Kobo
            });

            const result = await executeCommissionsTool('claim_commissions', { action: 'claim', userId });
            
            expect(claimCommissions).toHaveBeenCalledWith(userId);
            // Assert the human-readable response uses Naira correctly
            expect(result).toContain('Success! 40000 NGN has been cleared and swept into your Vault Balance');
            expect(result).toContain('withdraw to your bank');
        });

        it('should handle claim rejection gracefully when no cleared commissions exist', async () => {
            const userId = '2349000000000';
            
            // Mock an empty claim
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

});
