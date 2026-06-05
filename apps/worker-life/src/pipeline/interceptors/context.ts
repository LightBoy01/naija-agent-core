import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { getOrgById } from '@naija-agent/firebase';
import { lifeMemory } from '../../services/lifeMemory.js';
import { heartbeatService } from '../../services/heartbeat.js';

export const ContextInterceptor: LifeInterceptor = {
  name: 'LifeContextLoad',
  execute: async (ctx: LifePipelineContext) => {
    // 1. Load Organization (if applicable)
    let org = ctx.orgId ? await getOrgById(ctx.orgId) : null;
    
    // --- RACE CONDITION FALLBACK ---
    if (!org && ctx.orgId) {
      const { getDb } = await import('@naija-agent/firebase');
      const db = getDb();
      const fallbackQuery = await db.collection('organizations')
          .where('config.botPhone', '==', ctx.orgId)
          .limit(1)
          .get();
      
      if (!fallbackQuery.empty) {
          org = fallbackQuery.docs[0].data() as any;
          ctx.orgId = fallbackQuery.docs[0].id;
      }
    }
    
    ctx.org = org;

    // 2. Load Aelixxr Core Memory & Stats
    const context = await lifeMemory.getContext(ctx.userPhone);
    ctx.lifeContext = context;
    ctx.energyCredits = context.energyCredits ?? 0;

    // 3. Load Active Heartbeat Monitors
    ctx.activeMonitors = await heartbeatService.getUserConfigs(ctx.userPhone);

    // 4. Resolve Timezone & Local Time
    const { getTimezoneFromPhone } = await import('../../utils/timezone.js');
    ctx.timezone = ctx.org?.timezone || getTimezoneFromPhone(ctx.userPhone);
    ctx.localTime = new Date().toLocaleString('en-NG', { timeZone: ctx.timezone });

    return ctx;
  }
};
