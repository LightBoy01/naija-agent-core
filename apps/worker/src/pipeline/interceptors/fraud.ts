import { PipelineContext, Interceptor } from '../types.js';
import { isBlacklisted } from '@naija-agent/database';

export const FraudInterceptor: Interceptor = {
  name: 'FraudCheck',
  execute: async (ctx: PipelineContext) => {
    if (ctx.isAdmin || ctx.isStaff) {
      return ctx;
    }

    const { blacklisted } = await isBlacklisted(ctx.from);
    if (blacklisted) {
      if (ctx.tenantWhatsAppService) {
        await ctx.tenantWhatsAppService.sendText(ctx.from, "🛑 Access Denied: Fraud Blacklist.");
      }
      ctx.shortCircuit = true;
      ctx.shortCircuitReason = 'FRAUD_BLACKLISTED';
    }

    return ctx;
  }
};
