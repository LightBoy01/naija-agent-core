import { PipelineContext, Interceptor } from '../types.js';
import { checkFraud } from '@naija-agent/firebase';

export const FraudInterceptor: Interceptor = {
  name: 'FraudCheck',
  execute: async (ctx: PipelineContext) => {
    // Admins and Staff bypass fraud checks
    if (ctx.isAdmin || ctx.isStaff) {
      return ctx;
    }

    const fraudRecord = await checkFraud(ctx.from);
    if (fraudRecord) {
      if (ctx.tenantWhatsAppService) {
          await ctx.tenantWhatsAppService.sendText(ctx.from, "🛑 Access Denied: Fraud Blacklist.");
      }
      ctx.shortCircuit = true;
      ctx.shortCircuitReason = 'FRAUD_BLACKLISTED';
    }

    return ctx;
  }
};
