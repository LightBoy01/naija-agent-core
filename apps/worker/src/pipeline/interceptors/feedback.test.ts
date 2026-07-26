import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackInterceptor } from './feedback.js';
import { PipelineContext } from '../types.js';

vi.mock('@naija-agent/database', () => ({
  insertBetaFeedback: vi.fn()
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('FeedbackInterceptor', () => {
    let baseCtx: any;

    beforeEach(() => {
        vi.clearAllMocks();
        baseCtx = {
            type: 'text',
            from: '2349099999999',
            orgId: 'test_org',
            org: {
                isBetaCohort: true
            },
            job: { data: { content: { text: '' } } },
            redisClient: {
                incr: vi.fn().mockResolvedValue(1),
                expire: vi.fn()
            },
            tenantWhatsAppService: {
                sendText: vi.fn()
            }
        };
    });

    it('should ignore non-feedback messages', async () => {
        const ctx = { ...baseCtx } as PipelineContext;
        ctx.job.data.content.text = 'Hello Zynux!';
        
        await FeedbackInterceptor.execute(ctx);
        expect(ctx.shortCircuit).toBeFalsy();
    });

    it('should ignore feedback if org is NOT in beta cohort', async () => {
        const ctx = { ...baseCtx } as PipelineContext;
        ctx.org!.isBetaCohort = false;
        ctx.job.data.content.text = '#feedback It broke';
        
        await FeedbackInterceptor.execute(ctx);
        expect(ctx.shortCircuit).toBeFalsy();
    });

    it('should block empty feedback and ask for details', async () => {
        const ctx = { ...baseCtx } as PipelineContext;
        ctx.job.data.content.text = '#feedback   ';
        
        await FeedbackInterceptor.execute(ctx);
        expect(ctx.shortCircuit).toBe(true);
        expect(ctx.shortCircuitReason).toBe('FEEDBACK_EMPTY');
        expect(baseCtx.tenantWhatsAppService.sendText).toHaveBeenCalledWith(
            '2349099999999',
            expect.stringContaining('Please include your feedback after the command')
        );
    });

    it('should successfully submit feedback and truncate if needed', async () => {
        const ctx = { ...baseCtx } as PipelineContext;
        ctx.job.data.content.text = '#feedback The AI priced my shoes at 100 Naira instead of 1000.';
        
        await FeedbackInterceptor.execute(ctx);
        
        const { insertBetaFeedback } = await import('@naija-agent/database');
        expect(insertBetaFeedback).toHaveBeenCalledWith('test_org', '2349099999999', 'The AI priced my shoes at 100 Naira instead of 1000.');
        expect(ctx.shortCircuit).toBe(true);
        expect(ctx.shortCircuitReason).toBe('FEEDBACK_SUBMITTED');
        expect(baseCtx.tenantWhatsAppService.sendText).toHaveBeenCalledWith(
            '2349099999999',
            expect.stringContaining('Feedback Received!')
        );
    });

    it('should rate limit after 5 submissions in one day', async () => {
        const ctx = { ...baseCtx } as PipelineContext;
        ctx.job.data.content.text = '#feedback Spamming the bot';
        (ctx.redisClient.incr as any).mockResolvedValue(6); // Simulate 6th submission
        
        await FeedbackInterceptor.execute(ctx);
        expect(ctx.shortCircuit).toBe(true);
        expect(ctx.shortCircuitReason).toBe('FEEDBACK_RATELIMIT');
        expect(baseCtx.tenantWhatsAppService.sendText).toHaveBeenCalledWith(
            '2349099999999',
            expect.stringContaining('maximum feedback submissions for today')
        );
        
        const { insertBetaFeedback } = await import('@naija-agent/database');
        expect(insertBetaFeedback).not.toHaveBeenCalled();
    });
});
