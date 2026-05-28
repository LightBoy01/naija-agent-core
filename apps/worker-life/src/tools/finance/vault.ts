import { Type } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { lifeMemory } from '../../services/lifeMemory.js';
import { verifyUserPin, setUserPin } from '@naija-agent/firebase';
import { auditService } from '../../services/auditService.js';

export const handlePinFailure = async (userId: string, context: any): Promise<string> => {
    const attempts = (context.pinAttempts || 0) + 1;
    if (attempts >= 3) {
        const lockoutTime = new Date(Date.now() + 15 * 60000); // 15 mins
        await lifeMemory.updateContext(userId, { pinAttempts: 0, pinLockUntil: lockoutTime });
        return "🚨 SECURITY LOCKOUT: You have entered the wrong PIN too many times. Your Vault is locked for 15 minutes for your protection.";
    } else {
        await lifeMemory.updateContext(userId, { pinAttempts: attempts });
        return 'Security Alert: Incorrect PIN. You have ' + (3 - attempts) + ' attempts left before your vault is locked.';
    }
};

export const VAULT_TOOL_DEFINITIONS = [
    {
      name: 'convert_vault_to_energy',
      description: 'Converts Naira from the user\'s Vault balance into Energy Credits. 100 Naira = 10 Energy Credits. Use this when the user asks to buy energy/battery using the money already in their vault.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          amountNaira: { type: Type.NUMBER, description: 'The amount of Naira to convert into Energy Credits. Must be a multiple of 10 (e.g., 100, 500, 1000).' },
          pin: { type: Type.STRING, description: 'The user\'s 4-digit PIN.' }
        },
        required: ['amountNaira', 'pin']
      }
    },
    {
      name: 'get_financial_statement',
      description: 'Retrieves the user\'s current financial balances, including their Vault Balance (Real Naira) and their Energy Credits (Battery). Call this whenever the user asks for their balance, how much money they have, or their battery level.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "check_balance"' }
        },
        required: ['action']
      }
    }
];

export async function executeVaultTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    switch (name) {
      case 'convert_vault_to_energy':
        const amountNairaInput = Number(args.amountNaira);
        if (isNaN(amountNairaInput) || amountNairaInput <= 0 || amountNairaInput % 10 !== 0) {
            return { error: "Invalid amount. Please specify a valid Naira amount (multiple of 10) to convert." };
        }

        const amountKobo = amountNairaInput * 100;
        const userContext = await lifeMemory.getContext(args.userId);
        if (!userContext.pin) {
            await setUserPin(args.userId, args.pin);
            logger.info({ userId: args.userId }, '🔐 User set their initial PIN');
        } else {
            const isPinValid = await verifyUserPin(args.userId, args.pin);
            if (!isPinValid) {
                const errorMsg = await handlePinFailure(args.userId, userContext);
                await auditService.logVaultAction({
                    userId: args.userId,
                    toolName: 'convert_vault_to_energy',
                    amountKobo: amountKobo,
                    currency: 'NGN',
                    direction: 'out',
                    status: 'failed',
                    metadata: { error: 'Invalid PIN' }
                }, jobId);
                return { error: errorMsg };
            }
            if ((userContext.pinAttempts ?? 0) > 0) {
                await lifeMemory.updateContext(args.userId, { pinAttempts: 0 });
            }
        }

        const energyToAdd = Math.floor(amountNairaInput / 10);
        
        try {
            const newVaultBalanceKobo = await lifeMemory.deductVaultBalance(args.userId, amountKobo);
            if (newVaultBalanceKobo === null) {
                await auditService.logVaultAction({
                    userId: args.userId,
                    toolName: 'convert_vault_to_energy',
                    amountKobo: amountKobo,
                    currency: 'NGN',
                    direction: 'out',
                    status: 'failed',
                    metadata: { error: 'Insufficient Vault Funds' }
                }, jobId);
                return { error: 'Oga, you no get enough money for your Vault to buy ' + energyToAdd + ' Energy (₦' + amountNairaInput + '). Make you fund your Aelixxr Vault first.' };
            }

            const newEnergy = await lifeMemory.addEnergy(args.userId, energyToAdd, 'convert_' + Date.now());
            
            await auditService.logVaultAction({
                userId: args.userId,
                toolName: 'convert_vault_to_energy',
                amountKobo: amountKobo,
                currency: 'NGN',
                direction: 'out',
                status: 'success',
                metadata: { energyAdded: energyToAdd, newVaultBalanceKobo, newEnergyBalance: newEnergy }
            }, jobId);

            return {
                status: 'success',
                message: 'Successfully converted ₦' + amountNairaInput + ' into ' + energyToAdd + ' Energy Credits!',
                newEnergyBalance: newEnergy,
                newVaultBalanceNaira: newVaultBalanceKobo / 100,
                instructions: 'Enthusiastically inform the user that the conversion was successful. Tell them their new Energy Balance is ' + newEnergy + ' units, and their remaining Vault Balance is ₦' + (newVaultBalanceKobo / 100) + '.'
            };
        } catch (e: any) {
            logger.error({ error: e.message, userId: args.userId }, 'Failed vault conversion');
            await auditService.logVaultAction({
                userId: args.userId,
                toolName: 'convert_vault_to_energy',
                amountKobo: amountKobo,
                currency: 'NGN',
                direction: 'out',
                status: 'failed',
                metadata: { error: e.message }
            }, jobId);
            return { error: "I encountered an error trying to process the conversion. Please try again later." };
        }

      case 'get_financial_statement':
        try {
          const contextFin = await lifeMemory.getContext(args.userId);
          const vaultBalanceKobo = contextFin.vaultBalanceKobo || 0;
          const energyCredits = contextFin.energyCredits || 0;

          return {
            status: 'success',
            vaultBalanceNaira: vaultBalanceKobo / 100,
            energyCredits: energyCredits,
            instructions: 'Report the balances clearly to the user. Tell them they have ₦' + (vaultBalanceKobo / 100) + ' in their Aelixxr Vault and ' + energyCredits + ' Energy Credits remaining in their battery.'
          };
        } catch (error: any) {
          logger.error({ error: error.message, userId: args.userId }, 'Failed to fetch financial statement');
          return { error: "I had trouble checking the ledger. Please try again in a moment." };
        }

      default:
        throw new Error('Unknown Vault tool: ' + name);
    }
}
