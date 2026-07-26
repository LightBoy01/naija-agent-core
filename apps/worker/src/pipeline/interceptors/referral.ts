import { PipelineContext, Interceptor } from '../types.js';
import { parseAndFormatPhone } from '@naija-agent/types';
import { getPartnerStatus } from '@naija-agent/database';
import { logger } from '../../utils/logger.js';

export const ReferralInterceptor: Interceptor = {
  name: 'ReferralExtract',
  execute: async (ctx: PipelineContext) => {
    if (ctx.type !== 'text' || !ctx.job.data.content?.text) {
        return ctx;
    }

    const text = ctx.job.data.content.text;
    const match = text.match(/Ref:\s*(\+?\d+)/i);
    
    if (match && match[1]) {
        let extractedPhone = match[1];
        extractedPhone = parseAndFormatPhone(extractedPhone) || extractedPhone;
        // Strip the '+' sign because system (from, adminPhone, botPhone) uses raw E.164
        extractedPhone = extractedPhone.replace('+', '');
        
        // Block self-referral
        const adminPhone = ctx.org?.config?.adminPhone;
        const botPhone = ctx.org?.config?.botPhone || ctx.org?.whatsappPhoneId; // approximate checking
        
        if (extractedPhone === adminPhone || extractedPhone === botPhone || extractedPhone === ctx.from) {
             logger.warn({ orgId: ctx.orgId, ref: extractedPhone }, '🛑 [REFERRAL_INTERCEPTOR] Blocked self-referral attempt.');
             (ctx as any).systemPromptExtension = `\n[SYSTEM_OVERRIDE: The user attempted a self-referral or the code is invalid. Tell them they get 10 free setup credits (₦100) and ignore the partner code.]`;
             return ctx;
        }

        const partnerStatus = await getPartnerStatus(extractedPhone);
        if (partnerStatus.isPartner) {
            if (partnerStatus.isBeta) {
                (ctx as any).systemPromptExtension = `\n[SYSTEM_OVERRIDE: Valid BETA Partner (${extractedPhone}) detected from Ref code. Welcome the user to the Exclusive Beta Program. Explain they get a 7-day sandbox to help test the AI and that setup fees are completely waived. CRITICAL: Instruct them to report any bugs or AI hallucinations by starting their message with "#feedback". Call register_trial_interest with this referralPhone.]`;
                if (ctx.redisClient) {
                     await ctx.redisClient.set(`referral_beta:${ctx.from}`, 'true', 'EX', 7 * 24 * 60 * 60);
                }
            } else {
                (ctx as any).systemPromptExtension = `\n[SYSTEM_OVERRIDE: Valid partner (${extractedPhone}) detected from Ref code. You MUST tell the user they get 50 free setup credits (₦500) because they used a VIP Partner link. Call register_trial_interest with this referralPhone.]`;
            }
            // Cache it in Redis right away just in case
            if (ctx.redisClient) {
                 await ctx.redisClient.set(`referral:${ctx.from}`, extractedPhone, 'EX', 7 * 24 * 60 * 60);
            }
        } else {
            logger.warn({ orgId: ctx.orgId, ref: extractedPhone }, '🛑 [REFERRAL_INTERCEPTOR] Blocked invalid/unregistered partner phone.');
            (ctx as any).systemPromptExtension = `\n[SYSTEM_OVERRIDE: The referral code provided by the user is invalid or unregistered. Tell them they get 10 free setup credits (₦100) and ignore the partner code.]`;
        }
    }

    return ctx;
  }
};
