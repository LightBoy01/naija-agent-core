import { PipelineContext, Interceptor } from '../types.js';
import { handleToolCall } from '../../tool-handlers.js';
import { logger } from '../../utils/logger.js';

export const MfaInterceptor: Interceptor = {
  name: 'SovereignMFA',
  execute: async (ctx: PipelineContext) => {
    const isManager = ctx.isAdmin || ctx.isStaff;
    if (!isManager || ctx.type !== 'text') {
      return ctx;
    }

    const content = ctx.job.data.content;
    const textTrimmed = content.text?.trim() || '';
    if (!textTrimmed) return ctx;

    const pendingMfaKey = `pending_mfa:${ctx.orgId}:${ctx.from}`;
    const pendingDataStr = await ctx.redisClient.get(pendingMfaKey);

    if (pendingDataStr && /^\d{6}$/.test(textTrimmed)) {
      const { setMfaCode } = await import('@naija-agent/database');
      
      const storedMfa = (ctx.org?.config as any)?.mfaCode;
      if (storedMfa && storedMfa === textTrimmed) {
        // Valid MFA!
        await ctx.redisClient.del(pendingMfaKey);
        await setMfaCode(ctx.orgId, null as any); // Clear it
        
        try {
            const pendingJob = JSON.parse(pendingDataStr);
            pendingJob.args.mfa_code = textTrimmed; // Inject code
            
            // Execute the pending tool call directly
            const response = await handleToolCall(pendingJob.tool, pendingJob.args, {
                orgId: ctx.orgId,
                from: ctx.from,
                isAdmin: !!ctx.isAdmin,
                isStaff: !!ctx.isStaff,
                isAuth: true,
                whatsappService: ctx.tenantWhatsAppService!,
                paymentProvider: ctx.tenantPaymentProvider || null,
                redisClient: ctx.redisClient,
                orgConfig: (ctx.org?.config as any),
                currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' } as any, // Simplified
                whatsappPhoneId: ctx.job.data.phoneId,
                customerName: ctx.job.data.name,
                isVisionContext: false
            });

            if (ctx.tenantWhatsAppService) {
                const msg = response?.message || `✅ Action Executed Successfully. (Response: ${JSON.stringify(response)})`;
                await ctx.tenantWhatsAppService.sendText(ctx.from, msg);
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to execute pending MFA job');
            if (ctx.tenantWhatsAppService) {
                await ctx.tenantWhatsAppService.sendText(ctx.from, `❌ MFA Accepted, but execution failed: ${error.message}`);
            }
        }

        ctx.shortCircuit = true;
        return ctx;
      } else {
        if (ctx.tenantWhatsAppService) {
            await ctx.tenantWhatsAppService.sendText(ctx.from, `❌ Incorrect 6-digit MFA Code.`);
        }
        ctx.shortCircuit = true;
        return ctx;
      }
    }

    return ctx;
  }
};
