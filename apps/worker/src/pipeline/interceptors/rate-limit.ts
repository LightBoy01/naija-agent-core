import { PipelineContext, Interceptor } from '../types.js';

export const RateLimitInterceptor: Interceptor = {
  name: 'RateLimit',
  execute: async (ctx: PipelineContext) => {
    // We need the org config for custom rate limits, so this must run after OrgLoad
    // If OrgLoad isn't done, we use defaults.
    const rateLimit = ctx.org?.config?.rateLimit || { windowSeconds: 60, maxRequests: 10 };
    
    const rateLimitKey = `rate_limit:${ctx.orgId}:${ctx.from}`;
    const requestCount = await ctx.redisClient.incr(rateLimitKey);
    
    if (requestCount === 1) {
      await ctx.redisClient.expire(rateLimitKey, rateLimit.windowSeconds);
    }
    
    if (requestCount > rateLimit.maxRequests) {
      if (requestCount === rateLimit.maxRequests + 1) {
          // Send warning only once per window
          const service = ctx.tenantWhatsAppService || ctx.defaultWhatsAppService;
          await service.sendText(ctx.from, "Too many messages. Slow down Oga!");
      }
      ctx.shortCircuit = true;
      ctx.shortCircuitReason = 'RATE_LIMITED';
      return ctx;
    }

    return ctx;
  }
};
