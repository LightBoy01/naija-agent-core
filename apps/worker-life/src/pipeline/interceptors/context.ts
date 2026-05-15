import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { getOrgById } from '@naija-agent/firebase';
import { lifeMemory } from '../../services/lifeMemory.js';
import { heartbeatService } from '../../services/heartbeat.js';

export const ContextInterceptor: LifeInterceptor = {
  name: 'LifeContextLoad',
  execute: async (ctx: LifePipelineContext) => {
    // 1. Load Organization (if applicable)
    ctx.org = ctx.orgId ? await getOrgById(ctx.orgId) : null;

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
