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
    },
    {
      name: 'set_vault_pin',
      description: 'Sets or updates the user\'s 4-digit Vault PIN. Call this when a user asks to set their PIN for the first time.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          pin: { type: Type.STRING, description: 'The new 4-digit PIN the user wants to set.' }
        },
        required: ['pin']
      }
    },
    {
      name: 'request_pin_reset',
      description: 'Initiates a self-serve PIN reset by sending an OTP to the user\'s WhatsApp. Call this when the user forgets their PIN and wants to reset it.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reason: { type: Type.STRING, description: 'Always pass "forgot_pin"' }
        },
        required: ['reason']
      }
    },
    {
      name: 'confirm_pin_reset',
      description: 'Confirms a PIN reset by verifying the OTP sent to the user\'s WhatsApp and setting the new PIN.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          otp: { type: Type.STRING, description: 'The 6-digit OTP provided by the user.' },
          newPin: { type: Type.STRING, description: 'The new 4-digit PIN the user wants to set.' }
        },
        required: ['otp', 'newPin']
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
            return { error: "Oga, you never set your Vault PIN. Abeg use the set_vault_pin tool to set your PIN first before you fit convert energy." };
        }
        
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

      case 'set_vault_pin':
        try {
            const contextPin = await lifeMemory.getContext(args.userId);
            if (contextPin.pin) {
                 return { error: 'Oga, you already have a Vault PIN set. Contact support if you want to reset it.' };
            }
            
            if (!/^\d{4}$/.test(args.pin)) {
                return { error: 'PIN must be exactly 4 digits.' };
            }

            await setUserPin(args.userId, args.pin);
            logger.info({ userId: args.userId }, '🔐 User explicitly set their initial PIN');
            return {
                status: 'success',
                message: 'Your Vault PIN has been successfully set! You can now use it to make withdrawals and conversions.',
                instructions: 'Inform the user their PIN is set securely and they can now proceed with their financial transactions.'
            };
        } catch (e: any) {
            logger.error({ error: e.message, userId: args.userId }, 'Failed to set Vault PIN');
            return { error: 'Failed to set your Vault PIN. Please try again.' };
        }

      case 'request_pin_reset':
        try {
            const { pocketfi } = await import('../../services/pocketfiClient.js');
            if (!pocketfi) return { error: 'PocketFi is not configured. Cannot send OTP.' };
            
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiry = Date.now() + 10 * 60000; // 10 minutes
            await lifeMemory.updateContext(args.userId, { resetOtp: otp, resetOtpExpiry: expiry });
            
            const res = await pocketfi.sendWhatsAppOTP(args.userId, otp);
            if (res.success) {
                return {
                    status: 'success',
                    message: 'OTP sent successfully via PocketFi.',
                    instructions: 'Tell the user that an OTP has been sent to their WhatsApp. Ask them to provide the OTP along with their new 4-digit PIN to confirm the reset.'
                };
            } else {
                return { error: 'Failed to send OTP: ' + res.message };
            }
        } catch (e: any) {
            logger.error({ error: e.message, userId: args.userId }, 'Failed request_pin_reset');
            return { error: 'I encountered an error trying to send the OTP. Please try again later.' };
        }

      case 'confirm_pin_reset':
        try {
            const context = await lifeMemory.getContext(args.userId);
            if (!context.resetOtp || !context.resetOtpExpiry || Date.now() > Number(context.resetOtpExpiry)) {
                return { error: 'Your OTP has expired or was not requested. Please request a new PIN reset.' };
            }
            if (context.resetOtp !== String(args.otp).trim()) {
                return { error: 'The OTP you provided is incorrect. Please check and try again.' };
            }
            if (!/^\d{4}$/.test(args.newPin)) {
                return { error: 'PIN must be exactly 4 digits.' };
            }

            await setUserPin(args.userId, args.newPin);
            await lifeMemory.updateContext(args.userId, { resetOtp: null, resetOtpExpiry: null, pinAttempts: 0, pinLockUntil: null });
            
            logger.info({ userId: args.userId }, '🔐 User successfully reset their PIN via OTP');
            return {
                status: 'success',
                message: 'Your Vault PIN has been successfully reset! You can now use it.',
                instructions: 'Inform the user their new PIN is set securely and their Vault is fully accessible.'
            };
        } catch (e: any) {
            logger.error({ error: e.message, userId: args.userId }, 'Failed confirm_pin_reset');
            return { error: 'Failed to reset your Vault PIN. Please try again.' };
        }

      default:
        throw new Error('Unknown Vault tool: ' + name);
    }
}
