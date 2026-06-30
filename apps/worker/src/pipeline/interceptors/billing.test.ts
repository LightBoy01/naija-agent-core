import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingInterceptor } from './billing.js';
import { PipelineContext } from '../types.js';

vi.mock('@naija-agent/database', () => ({
  deductOrgBalance: vi.fn(),
  addOrgBalance: vi.fn(),
  getDb: vi.fn()
}));

describe('BillingInterceptor (Beta Cohort)', () => {
    let baseCtx: any;

    beforeEach(() => {
        baseCtx = {
            type: 'text',
            from: '2349099999999',
            orgId: 'test_org',
            job: { id: 'job_123' },
            billing: {},
            isAdmin: false,
            redisClient: {
                get: vi.fn().mockResolvedValue(null),
                setex: vi.fn(),
                del: vi.fn()
            },
            tenantWhatsAppService: {
                sendText: vi.fn()
            }
        };
    });

    it('should waive billing for a valid Beta Cohort organization', async () => {
        const ctx = {
            ...baseCtx,
            org: {
                balance: 1000,
                costPerReply: 100,
                isBetaCohort: true,
                betaExpiresAt: new Date(Date.now() + 86400000) // Expires in 1 day
            }
        } as unknown as PipelineContext;

        await BillingInterceptor.execute(ctx);
        expect(ctx.shortCircuit).toBeFalsy();
        expect(ctx.billing.deducted).toBeFalsy(); // Cost was waived, nothing deducted
        expect(baseCtx.tenantWhatsAppService.sendText).not.toHaveBeenCalled();
    });

    it('should short-circuit and send expiration notice if Beta Cohort is expired', async () => {
        const ctx = {
            ...baseCtx,
            org: {
                balance: 1000,
                costPerReply: 100,
                isBetaCohort: true,
                betaExpiresAt: new Date(Date.now() - 86400000) // Expired 1 day ago
            }
        } as unknown as PipelineContext;

        await BillingInterceptor.execute(ctx);
        
        expect(ctx.shortCircuit).toBe(true);
        expect(ctx.shortCircuitReason).toBe('BETA_EXPIRED');
        expect(baseCtx.tenantWhatsAppService.sendText).toHaveBeenCalledWith(
            '2349099999999', 
            expect.stringContaining('Beta Period Expired')
        );
    });
});
