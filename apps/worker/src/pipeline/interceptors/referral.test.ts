import { describe, it, expect, vi } from 'vitest';
import { ReferralInterceptor } from './referral.js';
import * as db from '@naija-agent/database';
import { PipelineContext } from '../types.js';

vi.mock('@naija-agent/database', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    getPartnerStatus: vi.fn(async (phone: string) => {
      if (phone === '2348000000000') return { isPartner: true, isBeta: false };
      if (phone === '2348000000001') return { isPartner: true, isBeta: true };
      return { isPartner: false, isBeta: false };
    })
  };
});

describe('ReferralInterceptor', () => {
    const baseCtx: Partial<PipelineContext> = {
        type: 'text',
        from: '2349099999999',
        orgId: 'test_org',
        org: {
            adminPhone: '2348111111111',
            whatsappPhoneId: '2348222222222'
        } as any,
        redisClient: {
            set: vi.fn()
        } as any
    };

    it('should correctly extract and validate a real partner', async () => {
        const ctx = {
            ...baseCtx,
            job: { data: { content: { text: 'Hello, Ref: 08000000000 is my partner' } } }
        } as unknown as PipelineContext;

        await ReferralInterceptor.execute(ctx);
        expect((ctx as any).systemPromptExtension).toContain('Valid partner (2348000000000) detected');
    });

    it('should correctly extract and validate a BETA partner', async () => {
        const ctx = {
            ...baseCtx,
            job: { data: { content: { text: 'Hello, Ref: 08000000001 is my partner' } } }
        } as unknown as PipelineContext;

        await ReferralInterceptor.execute(ctx);
        expect((ctx as any).systemPromptExtension).toContain('Valid BETA Partner (2348000000001) detected');
        expect(ctx.redisClient.set).toHaveBeenCalledWith('referral_beta:2349099999999', 'true', 'EX', 604800);
    });

    it('should gracefully handle an invalid partner code', async () => {
        const ctx = {
            ...baseCtx,
            job: { data: { content: { text: 'Ref: 09099998888' } } }
        } as unknown as PipelineContext;

        await ReferralInterceptor.execute(ctx);
        expect((ctx as any).systemPromptExtension).toContain('invalid or unregistered');
    });

    it('should explicitly block self-referrals via sender phone', async () => {
        const ctx = {
            ...baseCtx,
            job: { data: { content: { text: 'Ref: 09099999999' } } } // same as ctx.from but un-normalized format
        } as unknown as PipelineContext;

        await ReferralInterceptor.execute(ctx);
        expect((ctx as any).systemPromptExtension).toContain('self-referral');
    });

    it('should ignore messages without referral codes', async () => {
        const ctx = {
            ...baseCtx,
            job: { data: { content: { text: 'Hi I want a bot' } } }
        } as unknown as PipelineContext;

        await ReferralInterceptor.execute(ctx);
        expect((ctx as any).systemPromptExtension).toBeUndefined();
    });
});
