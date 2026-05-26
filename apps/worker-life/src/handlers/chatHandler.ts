import { Job } from 'bullmq';
import { SystemConfig, formatCurrency } from '@naija-agent/types';
import { 
    getOrgById, 
} from '@naija-agent/firebase';
import { 
    getChatHistory, 
    findOrCreateChat, 
    saveMessage 
} from '@naija-agent/database';
import { logger } from '../utils/logger.js';
import { executeLifeTool } from '../tools/index.js';
import { whatsappService } from '../services/whatsapp.js';
import { billingService } from '../services/billingService.js';
import { promptService } from '../services/promptService.js';
import { Formatter } from '../utils/formatter.js';
import { AIProvider, AIMessage } from '@naija-agent/ai';

// Pipeline Imports
import { LifePipeline } from '../pipeline/index.js';
import { ContextInterceptor } from '../pipeline/interceptors/context.js';
import { SecurityInterceptor } from '../pipeline/interceptors/security.js';
import { BatteryInterceptor } from '../pipeline/interceptors/battery.js';
import { MediaInterceptor } from '../pipeline/interceptors/media.js';

import { redactPII } from '../utils/security.js';

export interface ChatDependencies {
    ai: AIProvider;
    getDynamicModels: (systemInstruction?: string) => Promise<any>;
    lifeQueue: any;
    apiKey: string;
}

const lifePipeline = new LifePipeline()
    .use(ContextInterceptor)
    .use(SecurityInterceptor)
    .use(BatteryInterceptor)
    .use(MediaInterceptor);

export async function handleLifeChat(job: Job, deps: ChatDependencies) {
    const { ai, getDynamicModels, lifeQueue, apiKey } = deps;
    const { userPhone, message: rawMessage, orgId, imageId, documentId, audioId, type } = job.data;
    
    logger.info({ userPhone, orgId, hasImage: !!imageId, hasDoc: !!documentId, hasAudio: !!audioId }, '🧠 Thinking about Life...');

    const initialContext = {
        job,
        userPhone,
        orgId,
        message: rawMessage,
        type: type || 'text',
        imageId,
        documentId,
        audioId,
        org: null,
        lifeContext: null,
        energyCredits: 0,
        timezone: '',
        localTime: '',
        activeMonitors: [],
        securitySummary: '',
        ingestionSummary: '',
        mediaBuffer: null,
        mediaMime: null,
        ai,
        getDynamicModels,
        lifeQueue,
        apiKey,
        shortCircuit: false
    };

    const ctx = await lifePipeline.execute(initialContext);

    if (ctx.isError) {
        return { success: false, error: ctx.errorMessage };
    }

    if (ctx.shortCircuit) {
        return { success: false, reason: ctx.shortCircuitReason };
    }

    try {
        const soulPrompt = promptService.getPrompt('Aelixxr.Soul.md');
        let semanticMemories = '';

        if (ctx.message) {
            // Retrieve long-term memories relevant to current input
            const embeddingResult = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${process.env.GEMINI_API_KEY_EMBEDDING || apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: { parts: [{ text: ctx.message }] } })
            });
            const embedData = await embeddingResult.json() as any;
            const vector = (embedData.embedding?.values || []).slice(0, 768);
            
            if (vector.length === 768) {
                const { lifeMemory } = await import('../services/lifeMemory.js');
                const memoryResults = await lifeMemory.searchSemanticMemory(ctx.userPhone, vector, 3);
                if (memoryResults && memoryResults.length > 0) {
                    semanticMemories = `\n[LONG-TERM RECALL (Relevant to current context)]:\n${memoryResults.map(m => `- ${m.content}`).join('\n')}`;
                    logger.info({ memories: memoryResults.map(m => m.content), userPhone }, '🧠 Retrieved Semantic Memories');
                }
            }
        }

        const systemPrompt = `
${soulPrompt}
${ctx.securitySummary}
${ctx.ingestionSummary}

---
[CONTEXT]:
- UTC: ${new Date().toISOString()}
- Local: ${ctx.localTime} (${ctx.timezone})
- Energy: ${ctx.energyCredits}
- Goals: ${JSON.stringify(ctx.lifeContext.goals || [])}
- Active Monitors: ${JSON.stringify(ctx.activeMonitors)}${semanticMemories}
---`;

        const chatId = await findOrCreateChat(ctx.orgId || 'naija-agent-master', `${ctx.userPhone}_life`, 'User');
        const history = await getChatHistory(chatId, 10);
        
        const normalizedHistory: AIMessage[] = history.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const { primaryModel, tools } = await getDynamicModels(systemPrompt);
        
        let result;
        if (ctx.mediaBuffer && ctx.mediaMime) {
            result = await ai.analyzeImage(ctx.mediaBuffer, ctx.mediaMime, ctx.message || "Analyze this", {
                model: primaryModel,
                systemInstruction: systemPrompt,
                tools
            });
        } else {
            result = await ai.chat(normalizedHistory, ctx.message || "", {
                model: primaryModel,
                systemInstruction: systemPrompt,
                tools
            });
        }

        let text = result.text;
        const functionCalls = result.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
            const toolHistory: AIMessage[] = [
                ...normalizedHistory,
                { role: 'user', parts: [{ text: ctx.message || "[Media]" }] },
                { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) }
            ];

            let toolResponses: any[] = [];
            for (const call of functionCalls) {
                if (call.name === 'delegate_task') {
                    await lifeQueue.add('execute-slm-task', { 
                        ...job.data, 
                        chatId, 
                        sector: call.args.sector, 
                        instruction: call.args.instruction,
                        rawParameters: call.args.raw_parameters,
                        hops: (job.data.hops || 0) + 1
                    });
                    const replyMsg = `I'm consulting my ${call.args.sector} expert... ⏳`;
                    await whatsappService.sendText(ctx.userPhone, replyMsg);
                    const safeUserMessage = ctx.message ? redactPII(ctx.message) : (ctx.type === 'text' ? '[Empty Message]' : `[${ctx.type.toUpperCase()}]`);
                    await saveMessage(chatId, { role: 'user', content: safeUserMessage, type: ctx.type as any });
                    await saveMessage(chatId, { role: 'assistant', content: replyMsg, type: 'text' });

                    return { success: true, delegated: true };
                }

                const billResult = await billingService.billForTool(ctx.userPhone, call.name, ctx.energyCredits);
                if (!billResult.success) { 
                    text = billResult.errorText || "Insufficient energy."; 
                    break; 
                }
                
                const toolResult = await executeLifeTool(call.name, { ...call.args, userId: ctx.userPhone, sessionId: chatId }, job.id);
                
                if (toolResult && toolResult.error) {
                    logger.error({ toolName: call.name, error: toolResult.error }, '🛠️ Tool Execution Returned Error. Triggering Refund.');
                    await billingService.refundCredits(ctx.userPhone, billResult.costInCredits);
                }
                
                toolResponses.push({ functionResponse: { name: call.name, response: toolResult } });
                }

                if (toolResponses.length > 0) {
                const toolHistory = [...normalizedHistory, result, { role: 'function', parts: toolResponses }] as AIMessage[];
                const followUp = await ai.chat(toolHistory, "Continue based on tool results.", {
                    model: primaryModel,
                    systemInstruction: systemPrompt,
                    tools
                });
                text = followUp.text;
                if (followUp.thinking) {
                    logger.info({ userPhone: ctx.userPhone, thinking: followUp.thinking }, '🧠 [Agentic Thought - FollowUp]');
                }
                }
                }

                if (text) {
                await billingService.billForMessage(ctx.userPhone);
                await whatsappService.sendText(ctx.userPhone, Formatter.format(text));
                const safeUserMessage = ctx.message ? redactPII(ctx.message) : (ctx.type === 'text' ? '[Empty Message]' : `[${ctx.type.toUpperCase()}]`);
                await saveMessage(chatId, { role: 'user', content: safeUserMessage, type: ctx.type as any });

                // Save the message, optionally including the reasoning if it exists
                const assistantMsg: any = { role: 'assistant', content: text, type: 'text' };
                if (result.thinking) {
                assistantMsg.reasoning = result.thinking;
                }
                await saveMessage(chatId, assistantMsg);
                }
        
        return { success: true };
    } catch (apiError: any) {
        logger.error({ error: apiError.message }, '❌ AI Call Failed');
        return { success: false, error: apiError.message };
    }
}

export async function handleLifeChatResume(job: Job, deps: ChatDependencies) {
    const { ai, getDynamicModels } = deps;
    const { userPhone, slmReport, chatId, sector, orgId } = job.data;
    
    const org = await getOrgById(orgId || 'naija-agent-master');
    const soulPrompt = promptService.getPrompt('Aelixxr.Soul.md');
    const systemPrompt = `${soulPrompt}\n\n[CONTEXT]: Resuming task from ${sector}.`;

    const { primaryModel } = await getDynamicModels(systemPrompt);
    const history = await getChatHistory(chatId, 10);
    const normalizedHistory: AIMessage[] = history.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const resumeInstruction = `[REPORT from ${sector}]: ${slmReport}\n\nSynthesize this for the user in your Aelixxr persona.`;

    const result = await ai.chat(normalizedHistory, resumeInstruction, {
        model: primaryModel,
        systemInstruction: systemPrompt
    });

    if (result.text) {
        await whatsappService.sendText(userPhone, Formatter.format(result.text));
        await saveMessage(chatId, { role: 'assistant', content: result.text, type: 'text' });
    }

    return { success: true };
}
