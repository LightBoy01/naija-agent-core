import { lifeMemory } from './lifeMemory.js';
import { TOOL_COSTS, DEFAULT_TOOL_COST } from '../config/billing.js';
import { logger } from '../utils/logger.js';

export interface BillingResult {
    success: boolean;
    costInCredits: number;
    newBalance: number | null;
    errorText?: string;
}

export class BillingService {
    /**
     * Checks balance and deducts energy for a specific tool.
     * Returns a BillingResult indicating if the operation can proceed.
     */
    async billForTool(userId: string, toolName: string, currentBalance: number): Promise<BillingResult> {
        const cost = toolName in TOOL_COSTS ? TOOL_COSTS[toolName] : DEFAULT_TOOL_COST;
        const costInCredits = cost / 1000;

        if (cost <= 0) {
            return { success: true, costInCredits: 0, newBalance: currentBalance };
        }

        logger.info({ userId, toolName, costInCredits, currentBalance }, '🔋 Billing attempt for tool');

        // 🛡️ Security: Enforce Battery Reserve Check
        if (currentBalance <= 0) {
            return {
                success: false,
                costInCredits,
                newBalance: currentBalance,
                errorText: `Oga, my battery actually hit 0% right now! I'd love to use my ${toolName} tool for you, but I'm officially 'sleeping'. Please use your portal to recharge me! 🔋💤`
            };
        }

        const newBalance = await lifeMemory.deductEnergy(userId, costInCredits);

        if (newBalance === null) {
            return {
                success: false,
                costInCredits,
                newBalance: currentBalance,
                errorText: `I'd love to help with this, but ${toolName} takes a lot of energy (${costInCredits} units) and my battery is too low right now. Can we recharge quickly? 🔋🔌`
            };
        }

        return { success: true, costInCredits, newBalance };
    }

    /**
     * Deducts base energy for a standard message response.
     */
    async billForMessage(userId: string): Promise<void> {
        await lifeMemory.deductEnergy(userId, 1);
    }
}

export const billingService = new BillingService();
