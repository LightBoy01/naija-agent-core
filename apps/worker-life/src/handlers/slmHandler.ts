import { Job } from 'bullmq';
import path from 'path';
import { SystemConfig } from '@naija-agent/types';
import { logger } from '../utils/logger.js';
import { whatsappService } from '../services/whatsapp.js';
import { billingService } from '../services/billingService.js';
import { AIProvider } from '@naija-agent/ai';

export interface SLMDependencies {
    ai: AIProvider;
    lifeQueue: any;
    globalLifeTools: any[] | null;
    getLifeTools: () => Promise<any[]>;
}

import { dockerService } from '../services/dockerService.js';

export async function handleSLMTask(job: Job, deps: SLMDependencies) {
    const { ai, lifeQueue } = deps;
    const { 
        sector, 
        instruction: slmInst, 
        originalMessage: slmOrig, 
        userPhone: slmPhone, 
        chatId: slmChatId, 
        orgId: slmOrgId, 
        energyCredits: initialEnergy,
        budgetNaira,
        isHermesDelegation,
        hops,
        trajectory: initialTrajectory,
        stepCount: initialStepCount,
        cronJobId
    } = job.data;

    const currentHops = hops || 0;
    const currentStepCount = initialStepCount || 0;

    if (currentHops >= 5) {
        logger.error({ userPhone: slmPhone, hops: currentHops }, '🚫 [SLM GUARD] Maximum delegation hops reached.');
        const errorReport = JSON.stringify({ 
            status: "error", 
            report: "Oga, this task is becoming too complex for my sub-agents. Let's simplify what we are trying to do." 
        });

        if (job.data.isCron && cronJobId) {
            const { advanceCronJob } = await import('@naija-agent/database');
            await advanceCronJob(cronJobId, errorReport, false, initialTrajectory, currentStepCount);
        } else {
            await lifeQueue.add('life-chat-resume', {
                orgId: slmOrgId,
                userPhone: slmPhone,
                chatId: slmChatId,
                originalMessage: slmOrig,
                slmReport: errorReport,
                sector,
                hops: currentHops
            }, { removeOnComplete: true });
        }

        return { success: false, error: 'max_hops_reached' };
    }

    // Standard SLM direct execution path has been removed.
    // All execute-slm-task jobs must carry isHermesDelegation: true.
    if (!isHermesDelegation) {
        const errorMsg = 'Direct SLM execution path has been retired. Tasks must route through Hermes (Docker-on-Demand) or be handled inline by Aelixxr.';
        logger.error({ userPhone: slmPhone, sector }, `❌ [SLM] ${errorMsg}`);

        const errorReport = JSON.stringify({ status: "error", report: errorMsg });
        if (job.data.isCron && cronJobId) {
            const { advanceCronJob } = await import('@naija-agent/database');
            await advanceCronJob(cronJobId, errorReport, false, initialTrajectory, currentStepCount);
        } else {
            await lifeQueue.add('life-chat-resume', {
                orgId: slmOrgId,
                userPhone: slmPhone,
                chatId: slmChatId,
                originalMessage: slmOrig,
                slmReport: errorReport,
                sector,
                hops: currentHops + 1
            }, { removeOnComplete: true });
        }
        return { success: false, error: 'direct_slm_retired' };
    }

    // --- HERMES PATH (Docker-on-Demand) ---
    logger.info({ sector, userPhone: slmPhone, budget: budgetNaira, hops: currentHops }, '🚀 [HERMES BRIDGE] Executing high-autonomy delegation via Docker-on-Demand...');
    
    let cleanedReport = "";

    try {
        if (!job.data.isCron) {
            const billResult = await billingService.billForTool(slmPhone, 'hermes_manual_delegation', initialEnergy ?? 0, undefined, job.id);
            if (!billResult.success) {
                throw new Error('Insufficient energy for autonomous delegation.');
            }
        }

        const { getDb, organizations, cronJobs } = await import('@naija-agent/database');
        const { eq } = await import('drizzle-orm');
        const sqlDb = getDb();
        const orgsResult = await sqlDb.select().from(organizations).where(eq(organizations.id, slmOrgId)).limit(1);
        const org = orgsResult[0];

        const dockerResponse = await dockerService.runHermesTask({
            instruction: slmInst,
            userPhone: slmPhone,
            orgId: slmOrgId,
            proxyUrl: org?.proxyUrl || '',
            sectorPack: sector,
            budgetNaira: budgetNaira || 500,
            trajectory: initialTrajectory,
            stepCount: currentStepCount
        });

        if (!dockerResponse.success) {
            throw new Error(dockerResponse.error || 'Docker execution failed');
        }

        let finalReport = "Oga, my autonomous sub-agent has finished the task. I'm checking the results now.";
        let hermesTrajectory = initialTrajectory || [];
        let hermesStepCount = currentStepCount + 1;

        if (cronJobId) {
            const jobResult = await sqlDb.select().from(cronJobs).where(eq(cronJobs.id, cronJobId)).limit(1);
            if (jobResult.length > 0 && jobResult[0].lastResult) {
                finalReport = jobResult[0].lastResult;
                hermesTrajectory = (jobResult[0].trajectory as any[]) || hermesTrajectory;
                hermesStepCount = jobResult[0].stepCount || hermesStepCount;
            }
        }

        cleanedReport = JSON.stringify({
            status: "success",
            report: finalReport,
            trajectory: hermesTrajectory,
            step_count: hermesStepCount
        });

        if (job.data.isCron && cronJobId) {
            const { advanceCronJob } = await import('@naija-agent/database');
            await advanceCronJob(cronJobId, "Docker task completed and verified.", true, hermesTrajectory, hermesStepCount);
        }
    } catch (e: any) {
        logger.error({ error: e.message }, '❌ [HERMES BRIDGE] Docker-on-Demand execution failed');
        cleanedReport = JSON.stringify({ status: "error", report: "I tried to delegate this to my autonomous engine but the system was too busy." });
    }

    if (!job.data.isCron) {
        await lifeQueue.add('life-chat-resume', {
            orgId: slmOrgId,
            userPhone: slmPhone,
            chatId: slmChatId,
            originalMessage: slmOrig,
            slmReport: cleanedReport,
            sector,
            hops: currentHops + 1
        }, { removeOnComplete: true });
    }

    return { success: true, slmReport: cleanedReport };
}
