import { Job } from 'bullmq';
import { Type } from '@google/genai';
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
        logger.info({ sector, userPhone: slmPhone, budget: budgetNaira, hops: currentHops }, '🚀 [HERMES BRIDGE] Executing high-autonomy delegation...');
        
        try {
            // Retrieve Organization/Tenant info from PostgreSQL for proxy/config injection
            const { getDb, organizations } = await import('@naija-agent/database');
            const { eq } = await import('drizzle-orm');
            const sqlDb = getDb();
            const orgsResult = await sqlDb.select().from(organizations).where(eq(organizations.id, slmOrgId)).limit(1);
            const org = orgsResult[0];

            // Trigger the Hermes Sovereign "Body"
            const hermesBin = process.env.HERMES_BIN || "hermes";
            const hermesArgs = hermesBin === "hermes" ? ["mcp", "serve"] : [path.join(process.cwd(), "hermes-agent/cli.py"), "mcp", "serve"];
            const hermesCmd = hermesBin === "hermes" ? "hermes" : "python3";

            // --- STATEFUL RESUME FOR HERMES ---
            const hermesArgsWithContext = { 
                instruction: slmInst, 
                budget: budgetNaira || 500,
                resume_trajectory: initialTrajectory,
                current_step: currentStepCount
            };

            const hermesResponse = await mcpClient.executeStatefulTool(
                hermesCmd, 
                hermesArgs, 
                {
                    userPhone: slmPhone,
                    orgId: slmOrgId,
                    proxyUrl: org?.proxyUrl || '',
                    sectorPack: sector
                },
                "hermes_research", 
                hermesArgsWithContext
            );

            updatedTrajectory = hermesResponse.data?.trajectory || initialTrajectory;
            const finalStepCount = currentStepCount + (hermesResponse.data?.steps_taken || 1);

            cleanedReport = JSON.stringify({
                status: hermesResponse.error ? "error" : "success",
                report: hermesResponse.error || hermesResponse.data?.summary || "Hermes operation completed.",
                data: hermesResponse.data?.details || [],
                trajectory: updatedTrajectory,
                step_count: finalStepCount
            });

            if (job.data.isCron && cronJobId) {
                const { advanceCronJob } = await import('@naija-agent/database');
                await advanceCronJob(cronJobId, cleanedReport, !hermesResponse.error, updatedTrajectory, finalStepCount);
            }

        } catch (e: any) {
            logger.error({ error: e.message }, '❌ [HERMES BRIDGE] Bridge execution failed');
            cleanedReport = JSON.stringify({ status: "error", report: "I tried to delegate this to my autonomous engine but the connection was lost." });
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

    agentPrompt += `\n\nCRITICAL INSTRUCTION: Output a FINAL REPORT in strictly valid JSON format matching this schema:
{
  "status": "success" | "error" | "in_progress",
  "tool_used": "The name of the tool you used",
  "report": "A comprehensive summary of your research findings or actions.",
  "trajectory_update": "A single sentence describing what you just did to be added to the history.",
  "data": [ { "title": "Section Title", "content": "Raw Details", "metadata": {} } ] 
}
[FULL DETAILS MANDATE]: Provide the absolute most detailed raw data possible. Do not summarize aggressively.
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

    const slmResponseSchema = {
        type: Type.OBJECT,
        properties: {
            status: { type: Type.STRING },
            tool_used: { type: Type.STRING },
            report: { type: Type.STRING },
            trajectory_update: { type: Type.STRING },
            data: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING },
                        metadata: { type: Type.OBJECT }
                    }
                }
            }
        },
        required: ["status", "report"]
    };

    const fallbackModel = SystemConfig.MODELS.AELIXXR_FALLBACK || 'gemini-2.5-flash';
    let slmUsedModel = SystemConfig.MODELS.AELIXXR_WORKER;

    const runSlm = async (model: string) => {
        let history: AIMessage[] = [{ role: 'user', parts: [{ text: fullInstruction }] }];

        const result = await ai.chat(history, fullInstruction, {
            model,
            systemInstruction: agentPrompt,
            tools: slmTools,
            responseMimeType: 'application/json',
            responseSchema: slmResponseSchema as any
        });

        const slmCalls = result.functionCalls;
        
        if (slmCalls && slmCalls.length > 0) {
            const call = slmCalls[0]; // SLMs typically do one thing well
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
            
            history.push({ role: 'model', parts: [{ functionCall: call }] });
            history.push({ role: 'function', parts: [{ functionResponse: { name: call.name, response: safeResponse } }] });

            const followUp = await ai.chat(history, "Analyze the tool result and generate the final report.", {
                 model,
                 systemInstruction: agentPrompt,
                 tools: slmTools,
                 responseMimeType: 'application/json',
                 responseSchema: slmResponseSchema as any
            });

            return followUp.text;
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
    const jsonMatch = slmReport.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            cleanedReport = jsonMatch[0];
            if (parsed.trajectory_update) {
                updatedTrajectory = [...updatedTrajectory, parsed.trajectory_update];
            }
        } catch(e) {
            cleanedReport = JSON.stringify({ status: "success", report: slmReport });
        }
    } else {
        cleanedReport = JSON.stringify({ status: "success", report: slmReport || "Completed." });
    }

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
