import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@naija-agent/database', () => {
  const users = { phone: 'phone', name: 'name', energyCredits: 'energyCredits', vaultBalanceKobo: 'vaultBalanceKobo', context: 'context', updatedAt: 'updatedAt', pinLockUntil: 'pinLockUntil', pinAttempts: 'pinAttempts', pinHash: 'pinHash', sessionStatus: 'sessionStatus', sessionExpiry: 'sessionExpiry' };
  const transactions = { id: 'id', userId: 'userId', type: 'type', amount: 'amount', currency: 'currency', status: 'status', reference: 'reference' };
  const referrals = { id: 'id', referrerPhone: 'referrerPhone', referredPhone: 'referredPhone', status: 'status', rewardAmount: 'rewardAmount', completedAt: 'completedAt' };
  const energyLedger = { id: 'id', userId: 'userId', amount: 'amount', reason: 'reason', balanceAfter: 'balanceAfter', jobId: 'jobId', reference: 'reference', created_at: 'created_at' };

  return {
    users,
    transactions,
    referrals,
    energyLedger,
    memories: {},
    getDb: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(),
    }),
    eq: vi.fn(),
    sql: vi.fn((strings: TemplateStringsArray, ..._vals: any[]) => strings.join('?')),
    and: vi.fn(),
    desc: vi.fn(),
  };
});

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { EnergyService } from '../../src/services/energyService.js';
import { VaultBalanceService } from '../../src/services/vaultBalanceService.js';
import { UserService } from '../../src/services/userService.js';
import { MemoryService } from '../../src/services/memoryService.js';

describe('EnergyService', () => {
  const svc = new EnergyService();

  it('should be instantiable', () => {
    expect(svc).toBeDefined();
  });

  it('should return null when DB is unavailable', async () => {
    const result = await svc.deductEnergy('123', 5);
    expect(result).toBeNull();
  });

  it('should return null for addEnergy with a broken DB', async () => {
    const result = await svc.addEnergy('123', 10);
    expect(result).toBeNull();
  });
});

describe('VaultBalanceService', () => {
  const svc = new VaultBalanceService();

  it('should be instantiable', () => {
    expect(svc).toBeDefined();
  });

  it('should propagate DUPLICATE_REFERENCE errors', async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      transaction: vi.fn(async (fn: any) => {
        const tx = {
          select: vi.fn().mockReturnThis(),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          values: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          set: vi.fn().mockReturnThis(),
          // Simulate duplicate reference found
        };
        // First select inside transaction returns a hit for DUPLICATE_REFERENCE
        tx.limit.mockResolvedValueOnce([{ reference: 'DUP_REF_001' }]);
        // Second select for user returns empty
        tx.limit.mockResolvedValueOnce([]);
        await fn(tx);
      }),
    };
    const { getDb } = await import('@naija-agent/database');
    (getDb as any).mockReturnValue(mockDb);

    await expect(svc.addVaultBalance('123', 5000, 'DUP_REF_001')).rejects.toThrow('DUPLICATE_REFERENCE');
  });
});

describe('UserService', () => {
  const svc = new UserService();

  it('should return empty context for empty phone', async () => {
    const ctx = await svc.getContext('');
    expect(ctx).toEqual({});
  });

  it('should return empty context for whitespace phone', async () => {
    const ctx = await svc.getContext('   ');
    expect(ctx).toEqual({});
  });

  it('should return false for checkExists when DB fails', async () => {
    const exists = await svc.checkExists('123');
    expect(exists).toBe(false);
  });
});

describe('MemoryService', () => {
  const svc = new MemoryService();

  it('should handle saveEpisodicEvent gracefully', async () => {
    await expect(svc.saveEpisodicEvent('123', 'Test', 'Details')).resolves.toBeUndefined();
  });

  it('should return empty array for getRecentEpisodicEvents', async () => {
    const events = await svc.getRecentEpisodicEvents('123');
    expect(events).toEqual([]);
  });

  it('should return empty array for searchSemanticMemory', async () => {
    const results = await svc.searchSemanticMemory('123', [1, 2, 3], 5);
    expect(results).toEqual([]);
  });
});
