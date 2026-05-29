import { Job } from 'bullmq';
import { logger } from '../utils/logger.js';
import { getDueCronJobs, advanceCronJob, updateCronJobStatus } from '@naija-agent/database';
import { billingService } from '../services/billingService.js';

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
            // Bill up-front for the energy budget
            const billResult = await billingService.billForTool(cronJob.userId, 'sovereign_cron_run', cronJob.energyBudget);
            
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
                energyCredits: billResult.newBalance, // Pass remaining balance
                isCron: true,
                cronJobId: cronJob.id,
                trajectory: cronJob.trajectory,
                stepCount: cronJob.stepCount || 0
            };

            await lifeQueue.add('execute-slm-task', slmJobData, {
                jobId: `cron-${cronJob.id}-${Date.now()}`,
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