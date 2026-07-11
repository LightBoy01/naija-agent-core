import { Type } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { claimCommissions, getPartnerStats } from '@naija-agent/database';

export const COMMISSIONS_TOOL_DEFINITIONS = [
    {
      name: 'claim_commissions',
      description: 'Claims all cleared referral commissions (older than 7 days) and sweeps the money directly into the user\'s Vault Balance.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "claim"' }
        },
        required: ['action']
      }
    },
    {
      name: 'get_partner_stats',
      description: 'Retrieves the user\'s partnership and referral statistics, including active referrals, total earned commissions, cleared commissions ready for claim, and pending commissions (under 7 days old).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "get_stats"' }
        },
        required: ['action']
      }
    },
    {
      name: 'generate_referral_link',
      description: 'Generates the user\'s unique 30% revenue share referral link. Use this when the user wants to make money, refer a business, or needs funds in their Vault.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "generate"' }
        },
        required: ['action']
      }
    }
];

export async function executeCommissionsTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    if (!args.userId) {
        return { error: "User ID is missing from context." };
    }

    switch (name) {
      case 'claim_commissions':
        try {
          const result = await claimCommissions(args.userId);
          if (result.success) {
            logger.info({ userId: args.userId, amount: result.amountClaimed }, '💰 User successfully claimed referral commissions to Vault');
            return `Success! ${result.amountClaimed / 100} NGN has been cleared and swept into your Vault Balance. You can now use it to vend utilities, buy energy, or withdraw to your bank.`;
          } else {
            return `No commissions available to claim right now. ${result.message}`;
          }
        } catch (error: any) {
          logger.error({ err: error, userId: args.userId }, 'Failed to claim commissions');
          return `Error claiming commissions: ${error.message}`;
        }

      case 'get_partner_stats':
        try {
          const stats = await getPartnerStats(args.userId);
          return `Partnership Stats:\n- Total Referrals: ${stats.totalReferrals}\n- Active (Earning) Referrals: ${stats.activeReferrals}\n- Total Earned All-Time: ${(stats.totalEarnedKobo / 100).toFixed(2)} NGN\n- Pending (Under 7 Days): ${(stats.totalPendingKobo / 100).toFixed(2)} NGN\n- Cleared (Ready to Claim): ${(stats.totalClearedKobo / 100).toFixed(2)} NGN`;
        } catch (error: any) {
          logger.error({ err: error, userId: args.userId }, 'Failed to get partner stats');
          return `Error retrieving partnership stats: ${error.message}`;
        }
        
      case 'generate_referral_link':
        // NaijaAgent onboarding happens natively on WhatsApp, not via a web link!
        // We generate a frictionless wa.me deep link to the Zynux Master bot.
        const masterBotPhone = "2347011925076";
        const encodedText = encodeURIComponent(`Hi Zynux, I want to setup my bot. Ref: ${args.userId}`);
        const waLink = `https://wa.me/${masterBotPhone}?text=${encodedText}`;
        
        return `NaijaAgent Business Onboarding happens entirely on WhatsApp. Here is the frictionless link to give your friends:\n\n${waLink}\n\n"When they click this link, it will open a chat with the NaijaAgent Setup Bot and automatically tell it that you referred them. You will get 30% of every payment they make forever!"`;
        
      default:
        throw new Error(`Unknown commissions tool: ${name}`);
    }
}
