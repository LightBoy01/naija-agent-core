import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { whatsappService } from '../../services/whatsapp.js';
import { logger } from '../../utils/logger.js';

export const SecurityInterceptor: LifeInterceptor = {
  name: 'LifeSecurityGuard',
  execute: async (ctx: LifePipelineContext) => {
    // 1. Determine if a PIN is expected (State-Aware Hardening)
    const sessionStatus = ctx.lifeContext?.sessionStatus;
    const sessionExpiry = ctx.lifeContext?.sessionExpiry;
    
    let isAwaitingPin = false;
    if (sessionStatus === 'AWAITING_PIN') {
       let expiryMillis = 0;
       if (sessionExpiry instanceof Date) expiryMillis = sessionExpiry.getTime();
       else if (sessionExpiry && typeof (sessionExpiry as any).seconds === 'number') expiryMillis = (sessionExpiry as any).seconds * 1000;
       else if (typeof sessionExpiry === 'string') expiryMillis = Date.parse(sessionExpiry);

       if (expiryMillis > Date.now()) {
          isAwaitingPin = true;
       }
    }

    // 2. Detect 4-digit PINs
    const text = ctx.message?.trim() || "";
    const exactPinMatch = /^\d{4}$/.test(text);
    
    // JS Regex for PIN: Needs to be careful with capturing groups for the replace step
    const pinRegex = /(?:pin|code|password|otp)\s*(?:is\s*)?[:=-]*\s*(?<![₦NK])(\d{4})\b(?!\s*(?:naira|ngn|kobo|credits))|\b(?<![₦NK])(\d{4})\b(?!\s*(?:naira|ngn|kobo|credits))\s*(?:is\s*(?:the\s*|my\s*)?(?:pin|code|password|otp))/i;
    const keywordPinMatch = pinRegex.exec(text);
    
    let pin: string | null = null;
    if (exactPinMatch && isAwaitingPin) {
        pin = text;
    } else if (keywordPinMatch) {
        pin = keywordPinMatch[1] || keywordPinMatch[2];
    }
    
    if (pin) {
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
        ctx.securitySummary = `\n\n[SYSTEM SECURITY]: The user provided a 4-digit PIN (${pin}). Use it ONLY for the immediate tool call if you requested it.`;

        // DETERMINISTIC HARDENING: Redact the PIN from the message BEFORE it reaches the AI
        // and before it is saved to Chat History in the main handler.
        ctx.message = ctx.message!.replace(pin, '****');
        logger.info({ userPhone: ctx.userPhone }, '🛡️ [SECURITY] Deterministic PIN Redaction applied.');
    }

    return ctx;
  }
};
