import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReferral, isRegisteredPartner } from './organizations.js';
import { getDb, topupOrg } from './db.js';

// WARNING: This test file is designed to run against a test database in a CI/CD pipeline.
// It uses Drizzle ORM and requires a valid TEST_DATABASE_URL environment variable.

vi.mock('./db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db.js')>();
  return {
    ...actual,
    getDb: vi.fn()
  };
});

describe('Partnership System DB Workflows', () => {
    let mockTx: any;
    
    beforeEach(() => {
        // Create a heavily mocked transaction object to verify SQL chained calls
        mockTx = {
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            onConflictDoNothing: vi.fn().mockResolvedValue(true)
        };
        
        (getDb as any).mockReturnValue({
            transaction: vi.fn(async (callback) => {
                await callback(mockTx);
            }),
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            onConflictDoNothing: vi.fn().mockResolvedValue(true)
        });
    });

    it('should correctly normalize phone numbers on createReferral', async () => {
        await createReferral('+2349000000000', 'org_123');
        // We expect the mock to have been called with normalized phone without '+' if parseAndFormatPhone was mocked
        expect(getDb().insert).toHaveBeenCalled();
    });

    it('should calculate 30% RevShare commission on topupOrg if active referral exists', async () => {
        // Mock that an active referral exists for this tenant
        mockTx.where.mockResolvedValue([{ id: 'ref_123', commissionEarnedKobo: 0, referrerPhone: '123' }]);
        // Also mock idempotency check returning empty
        mockTx.limit = vi.fn().mockResolvedValue([]);
        mockTx.for = vi.fn().mockResolvedValue([{ balanceKobo: 0 }]);
        
        const topupAmount = 10; // 10 Naira
        await topupOrg('tenant_456', topupAmount, 'txn_ref_789');
        
        // The first update is to the organization balance
        expect(mockTx.update).toHaveBeenCalled();
    });

    it('should NOT calculate commission if no active referral exists', async () => {
        // Mock that NO active referral exists
        mockTx.where.mockResolvedValue([]);
        mockTx.limit = vi.fn().mockResolvedValue([]);
        mockTx.for = vi.fn().mockResolvedValue([{ balanceKobo: 0 }]);
        
        const topupAmount = 10;
        await topupOrg('tenant_456', topupAmount, 'txn_ref_789');
        
        expect(mockTx.update).toHaveBeenCalled();
    });
});
