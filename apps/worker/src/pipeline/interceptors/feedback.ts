import { PipelineContext, Interceptor } from '../types.js';
import { insertBetaFeedback } from '@naija-agent/database';
import { logger } from '../../utils/logger.js';

export const FeedbackInterceptor: Interceptor = {
  name: 'Feedback',
  execute: async (ctx: PipelineContext) => {
    if (ctx.type !== 'text' || !ctx.job.data.content?.text) {
        return ctx;
    }

    const text = ctx.job.data.content.text.trim();
    if (!text.toLowerCase().startsWith('#feedback')) {
        return ctx;
    }

    // Only allow beta cohort to use this deterministic feedback loop
    if (!ctx.org || !(ctx.org as any).isBetaCohort) {
        return ctx;
    }

    const feedbackContent = text.substring('#feedback'.length).trim();
    if (!feedbackContent) {
        if (ctx.tenantWhatsAppService) {
            await ctx.tenantWhatsAppService.sendText(ctx.from, `ℹ️ Please include your feedback after the command. E.g., "#feedback The price was wrong"`);
        }
        ctx.shortCircuit = true;
        ctx.shortCircuitReason = 'FEEDBACK_EMPTY';
        return ctx;
    }

    // Rate Limiting: Max 5 per day per user per org
    const dateStr = new Date().toISOString().split('T')[0];
    const rateLimitKey = `rate:feedback:${ctx.orgId}:${ctx.from}:${dateStr}`;
    
    if (ctx.redisClient) {
        try {
            const count = await ctx.redisClient.incr(rateLimitKey);
            if (count === 1) {
                await ctx.redisClient.expire(rateLimitKey, 86400); // 24 hours
            }
            
            if (count > 5) {
                if (ctx.tenantWhatsAppService) {
                    await ctx.tenantWhatsAppService.sendText(ctx.from, `🚫 You have reached the maximum feedback submissions for today (5). Thank you for your help!`);
                }
                logger.warn({ orgId: ctx.orgId, from: ctx.from }, '🛑 [FEEDBACK_INTERCEPTOR] Rate limit exceeded.');
                ctx.shortCircuit = true;
                ctx.shortCircuitReason = 'FEEDBACK_RATELIMIT';
                return ctx;
            }
        } catch (e: any) {
            logger.error({ error: e.message, orgId: ctx.orgId }, '⚠️ [FEEDBACK_INTERCEPTOR] Redis rate limiting failed, bypassing limit.');
        }
    }

    // Insert into PostgreSQL
    try {
        await insertBetaFeedback(ctx.orgId, ctx.from, feedbackContent);
    } catch (e: any) {
        logger.error({ error: e.message, orgId: ctx.orgId }, '❌ [FEEDBACK_INTERCEPTOR] Failed to save feedback');
    }

    if (ctx.tenantWhatsAppService) {
        await ctx.tenantWhatsAppService.sendText(ctx.from, `✅ *Feedback Received!*\n\nThank you for helping us improve the Zynux Beta.`);
    }

    ctx.shortCircuit = true;
    ctx.shortCircuitReason = 'FEEDBACK_SUBMITTED';
    return ctx;
  }
};
