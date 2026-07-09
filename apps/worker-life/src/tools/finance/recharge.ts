import { Type } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { whatsappService } from '../../services/whatsapp.js';
import { monnify } from '../../services/monnifyClient.js';
import { auditService } from '../../services/auditService.js';
import { lifeMemory } from '../../services/lifeMemory.js';
import { SystemConfig } from '@naija-agent/types';

export const RECHARGE_TOOL_DEFINITIONS = [
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
    }
];

export async function executeRechargeTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
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
        
        if (reference.includes('HACK') || reference.includes('DEBUG') || reference.startsWith('TEST_')) {
             if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'failed', { error: 'Fraud/Test Attempt Detected' });
             return { error: "FRAUD ALERT: This transaction reference looks like a test attempt. I cannot process this." };
        } else if (monnify) {
             const tx = await monnify.verify(reference, amountPaidNairaInput > 0 ? amountPaidNairaInput : 0);
             if (tx && tx.status === 'success') {
                 verifiedAmountNaira = tx.amount;
             } else {
                 if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'failed', { error: 'Verification failed at gateway' });
                 return { error: "Oga, I check the bank records for that Transaction ID, but I no see any successful payment. Abeg double-check the ID or try again later if bank delay." };
             }
        } else {
             if (auditLogIdTopup) await auditService.updateLogStatus(auditLogIdTopup, 'pending', { error: 'Payment gateway unavailable' });
             return { 
                 status: 'pending', 
                 message: 'Oga, I dey try confirm your payment but the bank network no too strong right now. I don log am for manual review. Abeg hold on.',
                 instructions: 'Inform the user that the payment gateway is down and it has been queued for manual review.'
             };
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

      default:
        throw new Error('Unknown Recharge tool: ' + name);
    }
}
