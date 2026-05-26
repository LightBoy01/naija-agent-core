import { Type } from '@google/genai';
import { logger } from '../utils/logger.js';
import { getDb, verifyUserPin, setUserPin } from '@naija-agent/firebase';
import { lifeMemory } from '../services/lifeMemory.js';
import { MonnifyProvider } from '@naija-agent/payments';
import { auditService } from '../services/auditService.js';

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

export const UTILITY_TOOLS = [
    {
      name: 'get_utility_products',
      description: 'Lists available utility providers or products (e.g., MTN Data plans, Electricity DisCos). Call this when a user wants to buy airtime, data, or pay a bill.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, enum: ['AIRTIME', 'DATA', 'ELECTRICITY', 'TV'], description: 'The type of utility.' },
          billerCode: { type: Type.STRING, description: 'Optional. Use this to get specific products for a provider (e.g. MTN_DATA).' }
        },
        required: ['category']
      }
    },
    {
      name: 'validate_utility_customer',
      description: 'Verifies a meter number or phone number for a utility provider. Call this BEFORE vending to ensure the details are correct.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          productCode: { type: Type.STRING, description: 'The code for the specific product (e.g. MTN_DATA_1GB).' },
          customerId: { type: Type.STRING, description: 'The meter number, smartcard ID, or phone number.' }
        },
        required: ['productCode', 'customerId']
      }
    },
    {
      name: 'vend_utility',
      description: 'Purchases the utility using the user\'s Vault balance. Call this ONLY after successful validation and PIN confirmation.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          amountNaira: { type: Type.NUMBER, description: 'The face value of the utility to buy.' },
          productCode: { type: Type.STRING },
          customerId: { type: Type.STRING },
          validationReference: { type: Type.STRING },
          pin: { type: Type.STRING, description: 'The user\'s 4-digit PIN.' }
        },
        required: ['amountNaira', 'productCode', 'customerId', 'validationReference', 'pin']
      }
    }
];

export async function executeUtilityTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    switch (name) {
      case 'get_utility_products':
        if (!monnify) return { error: "Monnify is not configured for utility vending." };
        try {
            if (args.billerCode) {
                const products = await monnify.getBillerProducts(args.billerCode);
                return { status: 'success', products };
            } else {
                const billers = await monnify.getBillers(args.category);
                return { status: 'success', billers };
            }
        } catch (e: any) {
            logger.error({ error: e.message }, 'Failed get_utility_products');
            return { error: "I no fit fetch the list of products right now." };
        }

      case 'validate_utility_customer':
        if (!monnify) return { error: "Monnify is not configured for validation." };
        try {
            const res = await monnify.validateUtilityCustomer(args.productCode, args.customerId);
            if (res) {
                return { 
                    status: 'success', 
                    customerName: res.customerName, 
                    validationReference: res.validationReference,
                    instructions: 'Tell the user you\'ve confirmed the account belongs to **' + res.customerName + '**. Ask for their PIN to complete the purchase.'
                };
            } else {
                return { error: "I search, but I no see any account with that number. Abeg check am." };
            }
        } catch (e: any) {
            logger.error({ error: e.message }, 'Failed validate_utility_customer');
            return { error: "I encounter error during account verification." };
        }

      case 'vend_utility':
        if (!monnify) return { error: "Monnify is not configured for vending." };

        const vendAmountNaira = Number(args.amountNaira);
        const vendAmountKobo = vendAmountNaira * 100;
        const totalToDeductKobo = vendAmountKobo + 10000; // ₦100 convenience fee = 10000 Kobo

        const userContext = await lifeMemory.getContext(args.userId);
        if (!userContext.pin) {
            await setUserPin(args.userId, args.pin);
            logger.info({ userId: args.userId }, '🔐 User set their initial PIN during utility purchase');
        } else {
            const isPinValid = await verifyUserPin(args.userId, args.pin);
            if (!isPinValid) {
                const errorMsg = await handlePinFailure(args.userId, userContext);
                await auditService.logVaultAction({
                    userId: args.userId,
                    toolName: 'vend_utility',
                    amountKobo: totalToDeductKobo,
                    currency: 'NGN',
                    direction: 'out',
                    status: 'failed',
                    metadata: { error: 'Invalid PIN', productCode: args.productCode }
                }, jobId);
                return { error: errorMsg };
            }
            if ((userContext.pinAttempts ?? 0) > 0) {
                await lifeMemory.updateContext(args.userId, { pinAttempts: 0 });
            }
        }

        const auditLogId = await auditService.logVaultAction({
            userId: args.userId,
            toolName: 'vend_utility',
            amountKobo: totalToDeductKobo,
            currency: 'NGN',
            direction: 'out',
            status: 'pending',
            metadata: { productCode: args.productCode, customerId: args.customerId }
        }, jobId);

        try {
            const newBalanceKobo = await lifeMemory.deductVaultBalance(args.userId, totalToDeductKobo);
            if (newBalanceKobo === null) {
                if (auditLogId) await auditService.updateLogStatus(auditLogId, 'failed', { error: 'Insufficient Vault Funds' });
                return { error: 'Oga, you no get enough money for your Vault for this ₦' + vendAmountNaira + ' purchase + ₦100 fee.' };
            }

            const vendRes = await monnify.vendUtility({
                productCode: args.productCode,
                customerId: args.customerId,
                amount: vendAmountNaira,
                reference: 'vend_' + args.userId + '_' + Date.now(),
                validationReference: args.validationReference
            });

            if (vendRes.success) {
                if (auditLogId) await auditService.updateLogStatus(auditLogId, 'success', { vendReference: vendRes.responseBody?.reference, newBalanceKobo });
                return {
                    status: 'success',
                    message: 'Purchase of ₦' + vendAmountNaira + ' successful! Your service go activate now.',
                    remainingBalance: newBalanceKobo / 100,
                    instructions: 'Enthusiastically inform the user that their purchase was successful. Their remaining balance is ₦' + (newBalanceKobo / 100) + '.'
                };
            } else {
                await lifeMemory.addVaultBalance(args.userId, totalToDeductKobo, 'rollback_vend_' + Date.now(), 'refund');
                if (auditLogId) await auditService.updateLogStatus(auditLogId, 'failed', { error: vendRes.message });
                return { error: 'Payment gateway reject the request: ' + vendRes.message + '. I don refund your ₦' + (totalToDeductKobo / 100) + ' to your Vault.' };
            }
        } catch (e: any) {
            logger.error({ error: e.message, userId: args.userId }, 'Failed vend_utility');
            if (auditLogId) await auditService.updateLogStatus(auditLogId, 'failed', { error: e.message });
            return { error: "I encounter serious error during vending. Abeg try again later." };
        }

      default:
        throw new Error('Unknown Utility tool: ' + name);
    }
}
