import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrgLoadInterceptor } from './org-load.js';
import { PipelineContext } from '../types.js';

vi.mock('@naija-agent/firebase', () => ({
  getOrgById: vi.fn(async (id: string) => {
    return {
      id,
      isActive: true,
      config: {
        payment: {
          provider: 'paystack',
          secretKey: 'sk_live_123'
        }
      }
    };
  }),
  getStaff: vi.fn(),
  getOrgOnboarding: vi.fn(),
  getDb: vi.fn()
}));

vi.mock('@naija-agent/database', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ 
            balanceKobo: 5000, 
            isBetaCohort: true, 
            betaExpiresAt: new Date() 
          }])
        }))
      }))
    }))
  })),
  organizations: {
    balanceKobo: 'balanceKobo',
    isBetaCohort: 'isBetaCohort',
    betaExpiresAt: 'betaExpiresAt',
    id: 'id'
  }
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn()
}));

vi.mock('../../services/whatsapp.js', () => ({
  WhatsAppService: vi.fn()
}));

vi.mock('@naija-agent/payments', () => ({
  getProvider: vi.fn((provider: string, key: string) => ({
    name: provider,
    key
  }))
}));

describe('OrgLoadInterceptor (Sandbox Isolation)', () => {
    let baseCtx: any;

    beforeEach(() => {
        baseCtx = {
            type: 'text',
            from: '2349099999999',
            orgId: 'test_org',
            job: { data: {} }
        };
    });

    it('should enforce MOCK payment provider if org is in Beta Cohort', async () => {
        const ctx = { ...baseCtx } as PipelineContext;
        
        await OrgLoadInterceptor.execute(ctx);
        
        expect(ctx.org).toBeDefined();
        expect((ctx.org as any).isBetaCohort).toBe(true);
        
        // Assert Sandbox Isolation
        expect(ctx.tenantPaymentProvider).toBeDefined();
        expect((ctx.tenantPaymentProvider as any).name).toBe('mock');
        expect((ctx.tenantPaymentProvider as any).key).toBe('sk_test_beta_sandbox');
    });
});
