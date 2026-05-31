import { PipelineContext, Interceptor } from '../types.js';
import { deductOrgBalance, addOrgBalance, getDb } from '@naija-agent/database';
import { SystemConfig } from '@naija-agent/types';

export const BillingInterceptor: Interceptor = {
  name: 'Billing',
  execute: async (ctx: PipelineContext) => {
    // 1. Prerequisites
    if (!ctx.org) throw new Error('Org data missing in BillingInterceptor');
    
    // Admins and the Master Bot do not pay per message.
    if (ctx.isAdmin || ctx.org.config?.isMaster) {
      return ctx;
    }

    // 2. Prevent Double-Deduction on Job Retries
    const billingKey = `billed:job:${ctx.job.id}`;
    const alreadyBilled = await ctx.redisClient.get(billingKey);
    
    if (alreadyBilled) {
        ctx.billing.deducted = true; 
        return ctx;
    }

    // 3. Determine Cost
    let costPerReply = 0;
    if (ctx.type === 'image') {
        costPerReply = ctx.org.costPerImage || SystemConfig.COSTS.IMAGE_PROCESSING_KOBO;
    } else if (ctx.type === 'document') {
        costPerReply = ctx.org.costPerDocument || SystemConfig.COSTS.DOCUMENT_ANALYSIS_KOBO;
    } else {
        costPerReply = ctx.org.costPerReply || SystemConfig.COSTS.REPLY_KOBO;
    }

    // 4. Pre-Flight Balance Check (Already synced from TiDB in OrgLoad)
    if (ctx.org.balance < costPerReply) {
      const greeting = ctx.org.region === 'NG' ? 'Oga' : 'Hello';
      if (ctx.tenantWhatsAppService) {
         await ctx.tenantWhatsAppService.sendText(ctx.from, `🚫 *Service Suspended*\n\n${greeting}, please top up to continue.`);
      }
      ctx.shortCircuit = true;
      ctx.shortCircuitReason = 'LOW_BALANCE';
      return ctx;
    }

    // 5. Execute Deduction
    if (costPerReply > 0) {
      const resultBalance = await deductOrgBalance(ctx.orgId, costPerReply);
      if (resultBalance === null) {
        throw new Error('Balance deduction failed in SQL database');
      }
      
      // Mark job as billed for 24 hours to prevent retry double-dips
      await ctx.redisClient.setex(billingKey, 86400, '1');

      ctx.billing.deducted = true;
      ctx.billing.amount = costPerReply;
      
      // Setup the rollback function for the catch block in index.ts
      const localOrgId = ctx.orgId;
      ctx.billing.rollback = async () => {
         await addOrgBalance(localOrgId, costPerReply);
         await ctx.redisClient.del(billingKey);
      };

      // Non-blocking telemetry (PostgreSQL implementation pending daily_stats schema)
      // For now, the deduction itself is sufficient as we can aggregate transactions later.
    }

    return ctx;
  }
};
