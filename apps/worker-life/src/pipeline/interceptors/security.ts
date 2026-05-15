import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { whatsappService } from '../../services/whatsapp.js';

export const SecurityInterceptor: LifeInterceptor = {
  name: 'LifeSecurityGuard',
  execute: async (ctx: LifePipelineContext) => {
    const isPinFormat = /^\d{4}$/.test(ctx.message?.trim() || "");
    
    if (isPinFormat) {
        const pin = ctx.message!.trim();
        const pinLockUntil = ctx.lifeContext?.pinLockUntil;
        let lockoutMillis = 0;

        // Firestore Timestamp loose normalization
        if (pinLockUntil instanceof Date) {
            lockoutMillis = pinLockUntil.getTime();
        } else if (pinLockUntil && typeof (pinLockUntil as any).toDate === 'function') {
            lockoutMillis = (pinLockUntil as any).toDate().getTime();
        } else if (typeof pinLockUntil === 'string') {
            lockoutMillis = Date.parse(pinLockUntil);
        } else if (pinLockUntil && typeof pinLockUntil === 'object' && 'seconds' in pinLockUntil) {
            lockoutMillis = (pinLockUntil as any).seconds * 1000;
        }

        if (lockoutMillis > Date.now()) {
            const minutesLeft = Math.ceil((lockoutMillis - Date.now()) / 60000);
            await whatsappService.sendText(ctx.userPhone, `🚨 *Security Alert!* Your Vault is locked. Try again in ${minutesLeft} minutes.`);
            ctx.shortCircuit = true;
            ctx.shortCircuitReason = 'PIN_LOCKOUT';
            return ctx;
        }

        // Pass the PIN safely to the LLM context if not locked out
        ctx.securitySummary = `\n\n[SYSTEM SECURITY]: The user provided a 4-digit PIN (${pin}). Use it IF you just asked for it.`;
    }

    return ctx;
  }
};
