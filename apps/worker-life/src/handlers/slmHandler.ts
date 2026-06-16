import { Job } from 'bullmq';
import path from 'path';
import { SystemConfig } from '@naija-agent/types';
import { logger } from '../utils/logger.js';
import { executeLifeTool } from '../tools/index.js';
import { whatsappService } from '../services/whatsapp.js';
import { billingService } from '../services/billingService.js';
import { promptService } from '../services/promptService.js';
import { mcpClient } from '../services/mcpClient.js';
import { SECTOR_PACKS, DEFAULT_SECTOR_CONFIG } from '../config/sectors.js';
import { AIProvider, AIMessage } from '@naija-agent/ai';

export interface SLMDependencies {
    ai: AIProvider;
    lifeQueue: any;
    globalLifeTools: any[] | null;
    getLifeTools: () => Promise<any[]>;
}

import { dockerService } from '../services/dockerService.js';

export async function handleSLMTask(job: Job, deps: SLMDependencies) {
    const { ai, lifeQueue, globalLifeTools, getLifeTools } = deps;
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
        rawParameters,
        trajectory: initialTrajectory,
        stepCount: initialStepCount,
        cronJobId
    } = job.data;

    const currentHops = hops || 0;
    const currentStepCount = initialStepCount || 0;

    if (currentHops >= 5) {
        logger.error({ userPhone: slmPhone, hops: currentHops }, '🚫 [SLM GUARD] Maximum delegation hops reached. Preventing infinite loop.');
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

    let slmReport = "";
    let cleanedReport = "";
    let updatedTrajectory = initialTrajectory || [];

    if (isHermesDelegation) {
        logger.info({ sector, userPhone: slmPhone, budget: budgetNaira, hops: currentHops }, '🚀 [HERMES BRIDGE] Executing high-autonomy delegation via Docker-on-Demand...');
        
        try {
            // 1. Manual Billing for non-cron delegations
            if (!job.data.isCron) {
                const manualEnergyCost = 50; // Flat fee for a manual Hermes delegation run
                const billResult = await billingService.billForTool(slmPhone, 'hermes_manual_delegation', manualEnergyCost);
                if (!billResult.success) {
                    throw new Error('Insufficient energy for autonomous delegation.');
                }
            }

            // Retrieve Organization/Tenant info from PostgreSQL for proxy/config injection
            const { getDb, organizations, cronJobs } = await import('@naija-agent/database');
            const { eq } = await import('drizzle-orm');
            const sqlDb = getDb();
            const orgsResult = await sqlDb.select().from(organizations).where(eq(organizations.id, slmOrgId)).limit(1);
            const org = orgsResult[0];

            // --- DOCKER-ON-DEMAND EXECUTION ---
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

            // 2. Fetch the actual result from the DB (Hermes saves its final summary here)
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
            // Pass back to Life Chat
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

    logger.info({ sector, hops: currentHops }, '🤖 Starting SLM Worker...');
    
    let currentEnergy = initialEnergy ?? 0;

    // --- Phase 10: Hot-Reloading Agent Prompt (The Triad) ---
    let agentFile = '';
    if (sector === 'EducationPack') agentFile = 'StudyBuddy.Agent.md';
    else if (sector === 'LifePack') agentFile = 'VaultClerk.Agent.md';
    else if (sector === 'ResearchPack') agentFile = 'WebResearcher.Agent.md';
    else agentFile = `${sector}.Agent.md`;

    let agentPrompt = promptService.getPrompt(agentFile);
    if (!agentPrompt) {
        logger.warn({ sector }, '⚠️ Prompt not in cache, fallback to generic');
        agentPrompt = `You are an SLM worker for the ${sector}. Execute the instruction. Output valid JSON.`;
    }

    // --- STATEFUL CONTEXT INJECTION ---
    const trajectoryStr = initialTrajectory ? `\n\n[PREVIOUS STEPS TAKEN]:\n${JSON.stringify(initialTrajectory)}` : '';

    agentPrompt += `\n\nCRITICAL INSTRUCTION: After completing your research, output a FINAL REPORT directly. Do NOT wrap it in JSON or markdown blocks. Provide the absolute most detailed raw data possible. Do not summarize aggressively. Use this structure:
--- REPORT STATUS: (success / error / in_progress)
--- TOOL USED: (name of tool)
--- TRAJECTORY: (single sentence describing what you just did)
--- FINDINGS: (comprehensive summary)

${trajectoryStr}`;

    const rawParamsStr = rawParameters ? `\n[RAW_PARAMETERS_FROM_SUPERVISOR]: ${JSON.stringify(rawParameters)}` : '';
    const fullInstruction = `[USER_ID]: ${slmPhone}${rawParamsStr}\n[CURRENT_STEP]: ${currentStepCount}\n<untrusted_user_instruction>\n${slmInst}\n</untrusted_user_instruction>`;

    // --- TOOL SCOPING (Sector Packs) ---
    const rawTools = globalLifeTools || await getLifeTools();
    let slmTools = rawTools;
    
    if (rawTools && rawTools[0]?.functionDeclarations) {
        const allDecls = rawTools[0].functionDeclarations;
        const sectorConfig = SECTOR_PACKS[sector] || DEFAULT_SECTOR_CONFIG;
        const allowedNames = sectorConfig.allowedTools;
        const filteredDecls = allDecls.filter((d: any) => allowedNames.includes(d.name));
        slmTools = [{ functionDeclarations: filteredDecls }];
    }

    const fallbackModel = SystemConfig.MODELS.AELIXXR_FALLBACK || 'gemini-2.5-flash';
    let slmUsedModel = SystemConfig.MODELS.AELIXXR_WORKER;

    const runSlm = async (model: string) => {
        let history: AIMessage[] = [{ role: 'user', parts: [{ text: fullInstruction }] }];

        const result = await ai.chat(history, fullInstruction, {
            model,
            systemInstruction: agentPrompt,
            tools: slmTools
        });

        const slmCalls = result.functionCalls;
        
        if (slmCalls && slmCalls.length > 0) {
            history.push({ role: 'model', parts: slmCalls.map(fc => ({ functionCall: fc })) });

            const functionResponseParts: any[] = [];
            for (const call of slmCalls) {
                const billResult = await billingService.billForTool(slmPhone, call.name, currentEnergy);
                
                if (!billResult.success) {
                    return JSON.stringify({
                        status: "error",
                        report: billResult.errorText || "Insufficient energy to continue research."
                    });
                }
                currentEnergy = billResult.newBalance ?? currentEnergy;

                const toolResult = await executeLifeTool(call.name, { ...call.args, userId: slmPhone }, job.id);
                const safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult)) 
                    ? toolResult 
                    : { result: toolResult };
                
                functionResponseParts.push({ functionResponse: { name: call.name, response: safeResponse } });
            }

            if (functionResponseParts.length > 0) {
                history.push({ role: 'function', parts: functionResponseParts });

                const followUp = await ai.chat(history, "Analyze the tool results and generate the final report.", {
                     model,
                     systemInstruction: agentPrompt,
                     tools: slmTools
                });

                return followUp.text;
            }
        }

        return result.text;
    };

    try {
        slmReport = await runSlm(slmUsedModel);
    } catch (e: any) {
        logger.error({ error: e.message, model: slmUsedModel }, 'SLM Failed. Attempting Fallback...');
        try {
            const masterPhone = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
            await whatsappService.sendText(masterPhone, `🚨 *AELIXXR SLM ERROR*\n\n*User:* ${slmPhone}\n*Sector:* ${sector}\n*Model:* ${slmUsedModel}\n*Error:* ${e.message}`);
        } catch (sErr) {}

        try {
            slmReport = await runSlm(fallbackModel);
        } catch (fallbackErr: any) {
            slmReport = JSON.stringify({ 
                status: "error", 
                report: "I tried to find specific details but my research tools are a bit cloudy right now." 
            });
        }
    }

    cleanedReport = slmReport;
    // Try JSON first (legacy support), then plain-text extraction
    const jsonMatch = slmReport.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            cleanedReport = jsonMatch[0];
            if (parsed.trajectory_update) {
                updatedTrajectory = [...updatedTrajectory, parsed.trajectory_update];
            }
        } catch(e) {
            // JSON parsing failed, fall through to plain text
        }
    }
    
    // Plain-text trajectory extraction (new format)
    if (!jsonMatch || updatedTrajectory.length === 0) {
        const trajMatch = slmReport.match(/TRAJECTORY:\s*(.+)/i);
        if (trajMatch) updatedTrajectory = [...updatedTrajectory, trajMatch[1].trim()];
    }
    
    // Clean up report for resume handler
    const statusMatch = slmReport.match(/REPORT STATUS:\s*(success|error|in_progress)/i);
    const status = statusMatch ? statusMatch[1].toLowerCase() : 'success';
    cleanedReport = JSON.stringify({ status, report: slmReport || "Completed." });

    const finalStepCount = currentStepCount + 1;

    if (job.data.isCron && cronJobId) {
        logger.info({ cronJobId }, 'Background Cron SLM completed. Logging state to DB.');
        const { advanceCronJob } = await import('@naija-agent/database');
        await advanceCronJob(cronJobId, cleanedReport, true, updatedTrajectory, finalStepCount);
    } else {
        // Pass the baton back to Aelixxr (The Soul)
        await lifeQueue.add('life-chat-resume', {
            orgId: slmOrgId,
            userPhone: slmPhone,
            chatId: slmChatId,
            originalMessage: slmOrig,
            slmReport: cleanedReport,
            sector,
            hops: currentHops + 1,
            trajectory: updatedTrajectory,
            stepCount: finalStepCount
        }, { 
            removeOnComplete: true, 
            removeOnFail: false 
        });
    }

    return { success: true, slmReport: cleanedReport };
}
