import { Type } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { lifeMemory } from '../../services/lifeMemory.js';
import { verifyUserPin, setUserPin } from '@naija-agent/firebase';
import { auditService } from '../../services/auditService.js';
import { monnify } from '../../services/monnifyClient.js';
import { monnifyBreaker } from '../../services/circuitBreaker.js';
import { handlePinFailure } from './vault.js';

export const PAYOUT_TOOL_DEFINITIONS = [
    {
      name: 'resolve_bank_account',
      description: 'Validates a Nigerian bank account number. Call this when a user wants to withdraw money so you can confirm their name first.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          bankName: { type: Type.STRING, description: 'The name of the bank (e.g., GTBank, Zenith, OPay).' },
          accountNumber: { type: Type.STRING, description: 'The 10-digit account number.' }
        },
        required: ['bankName', 'accountNumber']
      }
    },
    {
      name: 'withdraw_vault_funds',
      description: 'Transfers money from the user\'s Aelixxr Vault to their personal bank account. Call this ONLY after the user has provided their PIN and confirmed the account name.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          amountNaira: { type: Type.NUMBER, description: 'Amount to withdraw.' },
          bankCode: { type: Type.STRING, description: 'The bank code resolved from get_banks or resolve_bank_account.' },
          accountNumber: { type: Type.STRING, description: 'The 10-digit account number.' },
          pin: { type: Type.STRING, description: 'The user\'s 4-digit PIN.' }
        },
        required: ['amountNaira', 'bankCode', 'accountNumber', 'pin']
      }
    }
];

export async function executePayoutTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    switch (name) {
      case 'resolve_bank_account':
        if (!monnify) return { error: "Monnify is not configured for bank resolution." };
        try {
            const banks = await monnify.getBanks();
            const userBank = args.bankName.toLowerCase();
            const matchedBank = banks.find(b => b.name.toLowerCase().includes(userBank) || userBank.includes(b.name.toLowerCase()));

            if (!matchedBank) return { error: 'I no fit find any bank wey get name like "' + args.bankName + '". Abeg check the name well.' };

            const accountName = await monnify.resolveAccount(matchedBank.code, args.accountNumber);
            if (!accountName) return { error: 'I search for account ' + args.accountNumber + ' for ' + matchedBank.name + ', but I no see anything. Abeg verify the account number.' };

            return {
                status: 'success',
                accountName,
                bankName: matchedBank.name,
                bankCode: matchedBank.code,
                instructions: 'Tell the user that you\'ve confirmed the account belongs to **' + accountName + '** at **' + matchedBank.name + '**. Ask them to provide their PIN to authorize the withdrawal.'
            };
        } catch (e: any) {
            logger.error({ error: e.message }, 'Failed resolve_bank_account');
            return { error: "I encountered an error trying to resolve that bank account." };
        }

      case 'withdraw_vault_funds':
        if (!monnify) return { error: "Monnify is not configured for withdrawals." };

        const withdrawAmountNaira = Number(args.amountNaira);
        if (isNaN(withdrawAmountNaira) || withdrawAmountNaira < 500) return { error: "Minimum withdrawal amount is ₦500." };

        const withdrawAmountKobo = withdrawAmountNaira * 100;
        const withdrawContext = await lifeMemory.getContext(args.userId);
        if (!withdrawContext.pin) {
            return { error: 'Oga, you never set your Vault PIN. Abeg use the set_vault_pin tool to set your PIN first before you fit withdraw money.' };
        }
        
        const isPinValid = await verifyUserPin(args.userId, args.pin);
        if (!isPinValid) {
                const errorMsg = await handlePinFailure(args.userId, withdrawContext);
                await auditService.logVaultAction({
                    userId: args.userId,
                    toolName: 'withdraw_vault_funds',
                    amountKobo: withdrawAmountKobo,
                    currency: 'NGN',
                    direction: 'out',
                    status: 'failed',
                    metadata: { error: 'Invalid PIN' }
                }, jobId);
                return { error: errorMsg };
            }
            if ((withdrawContext.pinAttempts ?? 0) > 0) {
                await lifeMemory.updateContext(args.userId, { pinAttempts: 0 });
            }

        const auditLogIdW = await auditService.logVaultAction({
            userId: args.userId,
            toolName: 'withdraw_vault_funds',
            amountKobo: withdrawAmountKobo,
            currency: 'NGN',
            direction: 'out',
            status: 'pending',
            metadata: { bankCode: args.bankCode, accountNumber: args.accountNumber }
        }, jobId);

        try {
            const totalToDeductKobo = withdrawAmountKobo + 5000; // ₦50 fee = 5000 Kobo
            const newBalanceKobo = await lifeMemory.deductVaultBalance(args.userId, totalToDeductKobo);
            if (newBalanceKobo === null) {
                if (auditLogIdW) await auditService.updateLogStatus(auditLogIdW, 'failed', { error: 'Insufficient Vault Funds' });
                return { error: 'Oga, you no get enough money for your Vault for this ₦' + withdrawAmountNaira + ' withdrawal + ₦50 fee.' };
            }

            const payoutRes = await monnifyBreaker.execute(() => monnify!.payout({
                amount: withdrawAmountNaira,
                bankCode: args.bankCode,
                accountNumber: args.accountNumber,
                reference: 'withdraw_' + args.userId + '_' + Date.now(),
                narration: 'Aelixxr Withdrawal: ' + args.userId
            }));

            if (payoutRes.success) {
                if (auditLogIdW) await auditService.updateLogStatus(auditLogIdW, 'success', { payoutReference: payoutRes.reference, newBalanceKobo });
                return {
                    status: 'success',
                    message: 'Withdrawal of ₦' + withdrawAmountNaira + ' successful! The money is on its way to your account.',
                    remainingBalanceNaira: newBalanceKobo / 100,
                    instructions: 'Enthusiastically inform the user that the transfer of ₦' + withdrawAmountNaira + ' was successful. Their remaining balance is ₦' + (newBalanceKobo / 100) + '.'
                };
            } else {
                await lifeMemory.addVaultBalance(args.userId, totalToDeductKobo, 'rollback_' + Date.now(), 'refund');
                if (auditLogIdW) await auditService.updateLogStatus(auditLogIdW, 'failed', { error: payoutRes.message });
                return { error: 'Bank reject the transfer o: ' + payoutRes.message + '. I don refund your ₦' + (totalToDeductKobo / 100) + ' back to your Vault.' };
            }
        } catch (e: any) {
            logger.error({ error: e.message, userId: args.userId }, 'Failed withdraw_vault_funds');
            if (auditLogIdW) await auditService.updateLogStatus(auditLogIdW, 'failed', { error: 'API Error: ' + e.message });
            
            // If the circuit breaker is open, the request never reached Monnify. Safe to refund.
            if (e.message.includes('Circuit')) {
                await lifeMemory.addVaultBalance(args.userId, totalToDeductKobo, 'rollback_' + Date.now(), 'refund');
                return { error: 'The bank network is currently down. I have refunded your ₦' + (totalToDeductKobo / 100) + ' back to your Vault. Please try again later.' };
            }
            
            return { error: "I encountered a serious network error trying to process your withdrawal. Your payout is pending manual review. Please contact support." };
        }

      default:
        throw new Error('Unknown Payout tool: ' + name);
    }
}
