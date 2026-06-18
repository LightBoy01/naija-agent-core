import { Job } from 'bullmq';
import { logger } from '../utils/logger.js';
import { getDueCronJobs, advanceCronJob, updateCronJobStatus } from '@naija-agent/database';
import { billingService } from '../services/billingService.js';
import { lifeMemory } from '../services/lifeMemory.js';

export interface SovereignCronDependencies {
    lifeQueue: any;
}

export async function handleSovereignCronTick(job: Job, deps: SovereignCronDependencies) {
    const { lifeQueue } = deps;
    logger.info('⏰ [SOVEREIGN CRON] Tick received. Checking for due jobs...');

    try {
        const dueJobs = await getDueCronJobs();
        if (dueJobs.length === 0) {
            logger.info('⏰ [SOVEREIGN CRON] No jobs due at this time.');
            return { success: true, count: 0 };
        }

        logger.info({ count: dueJobs.length }, '⏰ [SOVEREIGN CRON] Found due jobs. Dispatching...');

        for (const cronJob of dueJobs) {
            // Fetch user's actual energy balance — NOT the cron budget
            const context = await lifeMemory.getContext(cronJob.userId);
            const actualBalance = context.energyCredits ?? 0;

            // Check if user has enough energy for a cron run (billed at DEFAULT tool cost = 3 credits)
            const billResult = await billingService.billForTool(cronJob.userId, 'sovereign_cron_run', actualBalance, undefined, job.id);
            
            if (!billResult.success) {
                logger.warn({ jobId: cronJob.id, userId: cronJob.userId }, '⏰ [SOVEREIGN CRON] Insufficient energy. Pausing job.');
                await updateCronJobStatus(cronJob.id, 'paused');
                continue;
            }

            // Dispatch to the SLM Worker (Hermes via MCP)
            const slmJobData = {
                orgId: cronJob.orgId,
                userPhone: cronJob.userId,
                chatId: `${cronJob.orgId}_${cronJob.userId}`,
                sector: cronJob.sectorPack || 'ResearchPack',
                instruction: cronJob.instruction,
                energyCredits: billResult.newBalance,
                isCron: true,
                isHermesDelegation: true,
                cronJobId: cronJob.id,
                trajectory: cronJob.trajectory,
                stepCount: cronJob.stepCount || 0
            };

            // --- THUNDERING HERD MITIGATION (JITTER) ---
            // If thousands of reminders trigger exactly at 8:00 AM, we randomly delay 
            // dispatching them to the worker between 0 and 300 seconds (5 minutes)
            // to avoid getting our WhatsApp Sidecar banned for spamming.
            const jitterMs = Math.floor(Math.random() * 300000);

            await lifeQueue.add('execute-slm-task', slmJobData, {
                jobId: `cron-${cronJob.id}-${Date.now()}`,
                delay: jitterMs,
                removeOnComplete: true,
                removeOnFail: false
            });

            // Advance the next run time in DB so it doesn't fire again until due
            await advanceCronJob(cronJob.id, "Dispatched to worker.", true);
        }

        return { success: true, count: dueJobs.length };
    } catch (error: any) {
        logger.error({ error: error.message }, '⏰ [SOVEREIGN CRON] Tick failed.');
        throw error;
    }
}