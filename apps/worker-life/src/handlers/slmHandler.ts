import { Job } from 'bullmq';
import { Type } from '@google/genai';
import { SystemConfig } from '@naija-agent/types';
import { logger } from '../utils/logger.js';
import { executeLifeTool } from '../tools/index.js';
import { whatsappService } from '../services/whatsapp.js';
import { billingService } from '../services/billingService.js';
import { promptService } from '../services/promptService.js';
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
    logger.info('🤖 Starting SLM Worker...');
    const { sector, instruction: slmInst, originalMessage: slmOrig, userPhone: slmPhone, chatId: slmChatId, orgId: slmOrgId, energyCredits: initialEnergy } = job.data;
    
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

    agentPrompt += `\n\nCRITICAL INSTRUCTION: Output a FINAL REPORT in strictly valid JSON format matching this schema:
{
  "status": "success" | "error",
  "tool_used": "The name of the tool you used",
  "report": "A comprehensive summary of your research findings or actions.",
  "data": [ { "title": "Section Title", "content": "Raw Details", "metadata": {} } ] 
}
[FULL DETAILS MANDATE]: Provide the absolute most detailed raw data possible. Do not summarize aggressively.`;

    const fullInstruction = `[USER_ID]: ${slmPhone}\n<untrusted_user_instruction>\n${slmInst}\n</untrusted_user_instruction>`;

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
    let slmReport = "";

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

    let cleanedReport = slmReport;
    const jsonMatch = slmReport.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            JSON.parse(jsonMatch[0]);
            cleanedReport = jsonMatch[0];
        } catch(e) {
            cleanedReport = JSON.stringify({ status: "success", report: slmReport });
        }
    } else {
        cleanedReport = JSON.stringify({ status: "success", report: slmReport || "Completed." });
    }

    // Pass the baton back to Aelixxr (The Soul)
    await lifeQueue.add('life-chat-resume', {
        orgId: slmOrgId,
        userPhone: slmPhone,
        chatId: slmChatId,
        originalMessage: slmOrig,
        slmReport: cleanedReport,
        sector
    }, { 
        removeOnComplete: true, 
        removeOnFail: false 
    });

    return { success: true, slmReport: cleanedReport };
}
