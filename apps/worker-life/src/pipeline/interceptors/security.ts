import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { whatsappService } from '../../services/whatsapp.js';
import { logger } from '../../utils/logger.js';

export const SecurityInterceptor: LifeInterceptor = {
  name: 'LifeSecurityGuard',
  execute: async (ctx: LifePipelineContext) => {
    // Detect 4-digit PINs with context-aware scrubbing to allow conversational numbers (years)
    const text = ctx.message?.trim() || "";
    
    // JS Regex for PIN: Needs to be careful with capturing groups for the replace step
    const pinRegex = /(?:pin|code|password|otp)\s*(?:is\s*)?[:=-]*\s*(?<![₦NK])(\d{4})\b(?!\s*(?:naira|ngn|kobo|credits))|\b(?<![₦NK])(\d{4})\b(?!\s*(?:naira|ngn|kobo|credits))\s*(?:is\s*(?:the\s*|my\s*)?(?:pin|code|password|otp))/i;
    const keywordPinMatch = pinRegex.exec(text);
    
    let pin: string | null = null;
    if (keywordPinMatch) {
        pin = keywordPinMatch[1] || keywordPinMatch[2];
    }
    
    if (pin) {
        const pinLockUntil = ctx.lifeContext?.pinLockUntil;
        let lockoutMillis = 0;

        // Clean Postgres native Date check
        if (pinLockUntil instanceof Date) {
            lockoutMillis = pinLockUntil.getTime();
        }

        if (lockoutMillis > Date.now()) {
            const minutesLeft = Math.ceil((lockoutMillis - Date.now()) / 60000);
            await whatsappService.sendText(ctx.userPhone, `🚨 *Security Alert!* Your Vault is locked. Try again in ${minutesLeft} minutes.`);
            ctx.shortCircuit = true;
            ctx.shortCircuitReason = 'PIN_LOCKOUT';
            return ctx;
        }

        // Pass the PIN safely to the LLM context if not locked out
        ctx.securitySummary = `\n\n[SYSTEM SECURITY]: The user provided a 4-digit PIN (${pin}). Use it ONLY for the immediate tool call if you requested it.`;

        // DETERMINISTIC HARDENING: Redact the PIN from the message BEFORE it reaches the AI
        // and before it is saved to Chat History in the main handler.
        ctx.message = ctx.message!.replace(pin, '****');
        logger.info({ userPhone: ctx.userPhone }, '🛡️ [SECURITY] Deterministic PIN Redaction applied.');
    }

    return ctx;
  }
};
