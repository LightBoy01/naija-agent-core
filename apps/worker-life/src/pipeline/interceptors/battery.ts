import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { whatsappService } from '../../services/whatsapp.js';

export const BatteryInterceptor: LifeInterceptor = {
  name: 'LifeBatteryGuard',
  execute: async (ctx: LifePipelineContext) => {
    // We only short-circuit if energy is critically depleted.
    // We DO NOT deduct energy here, because Aelixxr bills dynamically per tool call later.
    if (ctx.energyCredits <= -2) {
        await whatsappService.sendText(ctx.userPhone, `Oga, my battery is completely dead! 🪫 Please recharge.`);
        ctx.shortCircuit = true;
        ctx.shortCircuitReason = 'INSUFFICIENT_ENERGY';
    }
    return ctx;
  }
};
