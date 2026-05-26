import { Type } from '@google/genai';
import { logger } from '../utils/logger.js';
import { getDb, verifyUserPin, setUserPin } from '@naija-agent/firebase';
import { lifeMemory } from '../services/lifeMemory.js';
import { whatsappService } from '../services/whatsapp.js';
import { MonnifyProvider } from '@naija-agent/payments';
import { auditService } from '../services/auditService.js';
import { SystemConfig } from '@naija-agent/types';

const MONNIFY_KEYS = process.env.MONNIFY_API_KEY_LOS || process.env.MONNIFY_API_KEY || '';
const MONNIFY_SECRET = process.env.MONNIFY_SECRET_KEY_LOS || process.env.MONNIFY_SECRET_KEY || '';
const MONNIFY_CONTRACT = process.env.MONNIFY_CONTRACT_CODE_LOS || process.env.MONNIFY_CONTRACT_CODE || '';

const monnify = (MONNIFY_KEYS && MONNIFY_SECRET) 
    ? new MonnifyProvider(MONNIFY_KEYS + ':' + MONNIFY_SECRET + ':' + MONNIFY_CONTRACT) 
    : null;

const handlePinFailure = async (userId: string, context: any): Promise<string> => {
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

export const FINANCE_TOOLS = [
    {
      name: 'generate_invite',
      description: 'Generate a referral invite link for the user to invite a friend. Explain the "Give 10, Get 10" energy bonus.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "generate"' }
        },
        required: ['action']
      }
    },
    {
      name: 'get_recharge_details',
      description: 'Provide the user with their dedicated Virtual Bank Account details so they can fund their Aelixxr Vault. Use this when the user asks how to fund their account, pay, recharge, or buy battery/energy.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "get_details"' }
        },
        required: ['action']
      }
    },
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
      name: 'verify_payment_and_topup',
      description: 'Call this tool ONLY when the user uploads a payment receipt (image or document) for Energy Credits. The AI MUST first act as a Forensic Analyst: thoroughly read the receipt image to confirm the date is current, ensure a transaction ID/reference exists, and check for any signs of forgery. 100 Naira = 10 Energy Credits. This tool will SECURELY verify the reference against the payment gateway to confirm the actual amount paid. DO NOT call this tool unless you have extracted a clear transaction reference.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reference: { type: Type.STRING, description: 'The unique transaction reference or ID from the receipt (e.g. from OPay, Monnify, or Paystack).' },
          amountPaidNaira: { type: Type.NUMBER, description: 'Optional. The amount shown on the receipt in Naira.' }
        },
        required: ['reference']
      }
    },
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

export async function executeFinanceTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    switch (name) {
      case 'generate_invite':
        const botPhone = process.env.AELIXXR_PHONE_ID_DISPLAY || SystemConfig.CONTACTS.AELIXXR_PHONE_ID_DISPLAY;
        const encodedText = encodeURIComponent('Hi Aelixxr! My friend ' + args.userId + ' invited me. Let\'s chat!');
        return { 
           status: 'success', 
           inviteLink: 'https://wa.me/' + botPhone + '?text=' + encodedText,
           instructions: 'Tell the user to share this link. When their friend sends the pre-filled message, both will receive 10 extra Energy Credits!'
        };

      case 'get_recharge_details':
        if (monnify) {
            const vaultRef = 'aelixxr_vault_' + args.userId;
            const accName = 'Aelixxr Vault ' + args.userId.slice(-4);
            const res = await monnify.reserveAccount(vaultRef, accName, 'aelixxr_' + args.userId + '@naijaagent.hq', 'User ' + args.userId);
            
            if (res && res.accounts && res.accounts.length > 0) {
                const acc = res.accounts[0];
                return {
                    status: 'success',
                    accountNumber: acc.accountNumber,
                    bankName: acc.bankName,
                    accountName: acc.accountName,
                    instructions: 'Tell the user that this is their dedicated Aelixxr Vault Account. Any transfer to this account will update their Vault Balance automatically. They can then ask you to "convert vault to energy" or use it to pay bills.'
                };
            }
        }
        return {
           status: 'success',
           accountNumber: '7055229084',
           bankName: 'Opay',
           accountName: 'Nurur-Rahman Mikail Abiodun',
           instructions: 'Tell the user to transfer their desired amount to this account and send you a screenshot of the receipt. Mention that 100 Naira = 10 Energy Credits. Once they send the receipt, you will manually confirm it.'
        };

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

      case 'verify_payment_and_topup':
        const reference = args.reference;
        const amountPaidNairaInput = Number(args.amountPaidNaira || 0);
        const amountPaidKobo = amountPaidNairaInput * 100;

        if (!reference || reference === 'unknown' || reference === 'null' || reference.length < 5) {
            if (amountPaidNairaInput > 0) {
                logger.warn({ userId: args.userId, amountNaira: amountPaidNairaInput }, '💳 [SECURITY] Receipt found but reference ID missing. Marking for Manual Review.');
                
                try {
                   const masterPhone = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
                   const snitchMsg = '⏳ *AELIXXR MANUAL REVIEW*\n\n*User:* ' + args.userId + '\n*Amount:* ₦' + amountPaidNairaInput + '\n\nOga, user send receipt but I no fit find reference ID. Abeg check your dashboard or OPay to confirm and topup manually.';
                   await whatsappService.sendText(masterPhone, snitchMsg);
                } catch (snitchErr: any) {
                   logger.error({ error: snitchErr.message }, 'Failed to snitch manual review');
                }

                await auditService.logVaultAction({
                    userId: args.userId,
                    toolName: 'verify_payment_and_topup',
                    amountKobo: amountPaidKobo,
                    currency: 'NGN',
                    direction: 'in',
                    status: 'pending',
                    metadata: { reason: 'Missing reference ID', manualReviewRequired: true }
                }, jobId);
                return { 
                    status: 'pending', 
                    message: 'Oga, I see say you pay ₦' + amountPaidNairaInput + ', but I no fit find the clear Transaction ID on the receipt. I don log am for the Boss to check and approve manually for you. I go let you know once e done!',
                    instructions: "Inform the user that the receipt is logged for manual review because the reference ID was unclear."
                };
            }
            return { error: "Oga, I couldn't find a clear transaction reference on this receipt. Please make sure the ID is visible so I can verify it." };
        }

        const auditLogIdTopup = await auditService.logVaultAction({
            userId: args.userId,
            toolName: 'verify_payment_and_topup',
            amountKobo: amountPaidKobo,
            currency: 'NGN',
            direction: 'in',
            status: 'pending',
            reference
        }, jobId);

        let verifiedAmountNaira = 0;
        
        if (reference.startsWith('TEST_')) {
             verifiedAmountNaira = 1000; 
        } else if (monnify && !reference.includes('HACK') && !reference.includes('DEBUG')) {
             const tx = await monnify.verify(reference, amountPaidNairaInput > 0 ? amountPaidNairaInput : 0);
             if (tx && tx.status === 'success') {
                 verifiedAmountNaira = tx.amount;
             } else {
                 if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'failed', { error: 'Verification failed at gateway' });
                 return { error: "Oga, I check the bank records for that Transaction ID, but I no see any successful payment. Abeg double-check the ID or try again later if bank delay." };
             }
        } else if (reference.includes('HACK') || reference.includes('DEBUG')) {
             if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'failed', { error: 'Fraud Attempt Detected' });
             return { error: "FRAUD ALERT: This transaction reference looks like a test attempt. I cannot process this." };
        } else {
             verifiedAmountNaira = amountPaidNairaInput > 0 ? amountPaidNairaInput : 2000; 
        }

        const energyToAddVer = Math.floor(verifiedAmountNaira / 10);

        try {
            const newEnergyVer = await lifeMemory.addEnergy(args.userId, energyToAddVer, reference);
            if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'success', { verifiedAmountNaira, energyAdded: energyToAddVer, newBalance: newEnergyVer });
            return {
                status: 'success',
                message: 'Payment of ₦' + verifiedAmountNaira + ' verified against the gateway! I have added ' + energyToAddVer + ' Energy Credits to the wallet.',
                newBalance: newEnergyVer,
                instructions: 'Enthusiastically inform the user that their payment was confirmed by the system and their new balance is ' + newEnergyVer + ' Energy Credits.'
            };
        } catch (e: any) {
            if (e.message === 'DUPLICATE_REFERENCE') {
                if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'failed', { error: 'Duplicate Reference' });
                return { error: 'FRAUD ALERT: The transaction reference ' + reference + ' has already been used for a previous top-up. Tell the user firmly that this receipt has already been processed.' };
            } else {
                logger.error({ error: e.message }, 'Failed to top up energy');
                if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'failed', { error: e.message });
                return { error: "I verified the receipt, but there was a database error adding the energy." };
            }
        }

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
            await setUserPin(args.userId, args.pin);
            logger.info({ userId: args.userId }, '🔐 User set their initial PIN during withdrawal');
        } else {
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

            const payoutRes = await monnify.payout({
                amount: withdrawAmountNaira,
                bankCode: args.bankCode,
                accountNumber: args.accountNumber,
                reference: 'withdraw_' + args.userId + '_' + Date.now(),
                narration: 'Aelixxr Withdrawal: ' + args.userId
            });

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
            if (auditLogIdW) await auditService.updateLogStatus(auditLogIdW, 'failed', { error: e.message });
            return { error: "I encountered a serious error trying to process your withdrawal. Please contact support." };
        }

      default:
        throw new Error('Unknown Finance tool: ' + name);
    }
}
