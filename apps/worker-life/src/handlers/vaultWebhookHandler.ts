import { Job } from 'bullmq';
import { logger } from '../utils/logger.js';
import { lifeMemory } from '../services/lifeMemory.js';
import { whatsappService } from '../services/whatsapp.js';
import { auditService } from '../services/auditService.js';
import { formatCurrency } from '@naija-agent/types';

export interface VaultWebhookDependencies {
    phoneId?: string;
}

export async function handleVaultDeposit(job: Job, deps: VaultWebhookDependencies) {
    const { userPhone, amountPaid, reference } = job.data;

    if (!userPhone || !amountPaid) {
        logger.error({ jobId: job.id }, 'life-vault-deposit missing required fields');
        throw new Error('MISSING_REQUIRED_FIELDS');
    }

    const amountKobo = Math.round(amountPaid * 100); // Monnify sends amount in Naira
    const logId = `vdep-${job.id}`;

    logger.info({ userPhone, amountPaid, reference, jobId: job.id }, '🏦 Processing vault deposit');

    try {
        // 1. Log audit entry
        await auditService.logVaultAction({
            userId: userPhone,
            toolName: 'monnify_vault_deposit',
            direction: 'in',
            amountKobo,
            status: 'pending',
            reference
        }, logId);

        // 2. Credit vault balance
        const newBalance = await lifeMemory.addVaultBalance(userPhone, amountKobo, reference, 'deposit');

        if (newBalance === null) {
            await auditService.updateLogStatus(logId, 'failed', { error: 'addVaultBalance returned null' });
            throw new Error('VAULT_CREDIT_FAILED');
        }

        // 3. Mark audit as success
        await auditService.updateLogStatus(logId, 'success', { newBalanceKobo: newBalance });

        // 4. Send WhatsApp confirmation
        const formattedAmount = formatCurrency(amountPaid, 'en-NG', 'NGN');
        const formattedBalance = formatCurrency(newBalance / 100, 'en-NG', 'NGN');
        const msg = `✅ *Vault Deposit Received!*\n\nOga, your transfer of *${formattedAmount}* has been credited.\n\nYour new Vault balance is *${formattedBalance}*.\n\nSend me a message to convert it to Energy or make payments! 💰`;

        await whatsappService.sendText(userPhone, msg, deps.phoneId || process.env.AELIXXR_PHONE_ID);

        logger.info({ userPhone, amountPaid, newBalance, reference }, '✅ Vault deposit processed successfully');
        return { success: true, newBalance, amountKobo };
    } catch (error: any) {
        if (error.message === 'DUPLICATE_REFERENCE') {
            logger.info({ reference, userPhone }, '⏭️ Duplicate vault deposit ignored');
            return { success: false, reason: 'DUPLICATE_REFERENCE' };
        }

        // Mark audit as failed
        try {
            await auditService.updateLogStatus(logId, 'failed', { error: error.message });
        } catch (auditErr) {
            logger.error({ error: (auditErr as Error).message }, 'Failed to update audit log');
        }

        logger.error({ userPhone, error: error.message, jobId: job.id }, '❌ Vault deposit processing failed');
        throw error; // Re-throw so BullMQ retries
    }
}
