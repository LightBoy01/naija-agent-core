import { PipelineContext, Interceptor } from '../types.js';

export const SecurityInterceptor: Interceptor = {
  name: 'SecurityPIN',
  execute: async (ctx: PipelineContext) => {
    // Only applies to Managers (Admins or Staff)
    const isManager = ctx.isAdmin || ctx.isStaff;
    if (!isManager || ctx.type !== 'text') {
      return ctx;
    }

    const content = ctx.job.data.content;
    const textTrimmed = content.text?.trim() || '';
    if (!textTrimmed) return ctx;

    const expectingPinKey = `expecting_pin:${ctx.orgId}:${ctx.from}`;
    const isExpectingPin = await ctx.redisClient.get(expectingPinKey);

    let isPinAttempt = false;
    let pinAttempt = '';

    // Deterministic PIN regex matching
    if (isExpectingPin && /^\d{4}$/.test(textTrimmed)) { 
        isPinAttempt = true; pinAttempt = textTrimmed; 
    } else if (/^#\d{4}$/.test(textTrimmed)) { 
        isPinAttempt = true; pinAttempt = textTrimmed.substring(1); 
    } else if (/^PIN\s+\d{4}$/i.test(textTrimmed)) { 
        isPinAttempt = true; pinAttempt = textTrimmed.split(/\s+/)[1]; 
    }

    if (isPinAttempt && ctx.org) {
      // Clear the expectation lock
      await ctx.redisClient.del(expectingPinKey);
      
      const { setAdminAuth } = await import('@naija-agent/database');
      const bcrypt = await import('bcrypt');
      
      let isAuthenticated = false;
      
      // Currently only Admins have PINs, not staff (yet)
      if (ctx.isAdmin) {
          const storedHash = ctx.org.config?.adminPin;
          if (storedHash) { 
              if (await bcrypt.compare(pinAttempt, storedHash)) { 
                  await setAdminAuth(ctx.orgId, ctx.from); 
                  isAuthenticated = true; 
              } 
          }
      } 

      if (ctx.tenantWhatsAppService) {
          if (isAuthenticated) {
              await ctx.tenantWhatsAppService.sendText(ctx.from, `✅ *PIN Accepted!* Admin Mode unlocked.`);
          } else {
              await ctx.tenantWhatsAppService.sendText(ctx.from, `❌ *Incorrect PIN.*`);
          }

          // Stop pipeline if this was a PIN attempt (handled separately)
          ctx.shortCircuit = true;
          return ctx;
      }
    }

    return ctx;
  }
};
