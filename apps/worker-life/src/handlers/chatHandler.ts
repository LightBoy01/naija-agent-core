import { Job } from 'bullmq';
import { SystemConfig, formatCurrency, parseAndFormatPhone } from '@naija-agent/types';
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
import { SpamInterceptor } from '../pipeline/interceptors/spam.js';

import { redactPII } from '../utils/security.js';


import { redisClient } from '../index.js';

export interface ChatDependencies {
    ai: AIProvider;
    getDynamicModels: (systemInstruction?: string) => Promise<any>;
    lifeQueue: any;
    apiKey: string;
}

const lifePipeline = new LifePipeline()
    .use(ContextInterceptor)
    .use(SpamInterceptor)
    .use(SecurityInterceptor)
    .use(BatteryInterceptor)
    .use(MediaInterceptor);

export async function handleLifeChat(job: Job, deps: ChatDependencies) {
    const { ai, getDynamicModels, lifeQueue, apiKey } = deps;
    const rawPhone = job.data.userPhone || job.data.from || job.data.From;
    let userPhone = parseAndFormatPhone(rawPhone) || rawPhone;
    
    // TEMPORARY BYPASS: Map the masked LID back to the Master Admin Phone
    if (userPhone === '28364215738456@lid') {
        userPhone = '2347042310893';
    }
    const rawMessage = job.data.message !== undefined ? job.data.message : job.data.content?.text;
    let orgId = job.data.orgId;
    // Normalize type — Go sidecar sends 'life-chat' but we treat it as text
    const type = (job.data.type === 'life-chat') ? 'text' : job.data.type;
    const fileName = job.data.content?.fileName;
    
    // Map 'aelixxr' to the correct organization ID in the database
    if (orgId === 'aelixxr') {
        orgId = 'aelixxr-life-companion';
    }

    let isImage = type === 'image' || type === 'video';
    let isDoc = type === 'document';
    let isAudio = type === 'audio';

    if (fileName && type === 'life-chat') {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.pdf') || lower.endsWith('.doc') || lower.endsWith('.docx')) isDoc = true;
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.mp4') || lower.endsWith('.png')) isImage = true;
        else if (lower.endsWith('.ogg') || lower.endsWith('.mp3')) isAudio = true;
    }

    const imageId = job.data.imageId || job.data.content?.imageId || (isImage ? fileName : undefined);
    const documentId = job.data.documentId || job.data.content?.documentId || (isDoc ? fileName : undefined);
    const audioId = job.data.audioId || job.data.content?.audioId || (isAudio ? fileName : undefined);
    const hops = job.data.hops || 0;
    const phoneId = job.data.phoneId;
    
    // 🛡️ ASP G1: The Loop Guard
    if (hops >= 3) {
        logger.warn({ userPhone, hops }, '🚫 [LOOP GUARD] Maximum delegation hops reached. Aborting to prevent infinite loop.');
        await whatsappService.sendText(userPhone, "Oga, I don try reach out to all my experts but we don dey loop too much! Make we try another way or simplify wetin you need. 🛑", phoneId);
        return { success: false, error: 'LOOP_GUARD_TRIGGERED' };
    }

    logger.info({ userPhone, orgId, hasImage: !!imageId, hasDoc: !!documentId, hasAudio: !!audioId, hops }, '🧠 Thinking about Life...');

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
        phoneId,
        getDynamicModels,
        lifeQueue,
        apiKey,
        redisClient, // <--- Add Redis Client here
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
            const fullVector = await ai.embedText(ctx.message);
            const vector = fullVector.slice(0, 768);
            
            if (vector.length === 768) {
                const { lifeMemory } = await import('../services/lifeMemory.js');
                const memoryResults = await lifeMemory.searchSemanticMemory(userPhone, vector, 3);
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
- UNIX Timestamp: ${Date.now()}
- UTC: ${new Date().toISOString()}
- Local: ${ctx.localTime} (${ctx.timezone})
- Energy: ${ctx.energyCredits}
- Goals: ${JSON.stringify(ctx.lifeContext.goals || [])}
- Active Monitors: ${JSON.stringify(ctx.activeMonitors)}${semanticMemories}
---`;

        const chatId = await findOrCreateChat(ctx.orgId || 'naija-agent-master', `${userPhone}_life`, 'User');
        const history = await getChatHistory(chatId, 10);
        
        const normalizedHistory: AIMessage[] = history.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const { primaryModel, tools } = await getDynamicModels(systemPrompt);
        
        // --- TRIGGER TYPING INDICATOR ---
        whatsappService.sendTypingIndicator(userPhone).catch(e => 
            logger.warn({ error: e.message }, 'Failed to send typing indicator')
        );

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
                        userPhone,
                        chatId, 
                        sector: call.args.sector, 
                        instruction: call.args.instruction,
                        rawParameters: call.args.raw_parameters,
                        energyCredits: ctx.energyCredits,
                        hops: (job.data.hops || 0) + 1
                    });
                    const replyMsg = `I'm consulting my ${call.args.sector} expert... ⏳`;
                    await whatsappService.sendText(userPhone, replyMsg, ctx.phoneId);
                    const safeUserMessage = ctx.message ? redactPII(ctx.message) : (ctx.type === 'text' ? '[Empty Message]' : (isImage ? '[Image]' : isDoc ? '[Document]' : isAudio ? '[Audio]' : `[${ctx.type.toUpperCase()}]`));
                    await saveMessage(chatId, { role: 'user', content: safeUserMessage, type: ctx.type as any });
                    await saveMessage(chatId, { role: 'assistant', content: replyMsg, type: 'text' });

                    return { success: true, delegated: true };
                }

                const billResult = await billingService.billForTool(userPhone, call.name, ctx.energyCredits);
                if (!billResult.success) { 
                    text = billResult.errorText || "Insufficient energy."; 
                    break; 
                }
                
                const toolResult = await executeLifeTool(call.name, { ...call.args, userId: userPhone, sessionId: chatId }, job.id);
                
                if (toolResult && toolResult.error) {
                    logger.error({ toolName: call.name, error: toolResult.error }, '🛠️ Tool Execution Returned Error. Triggering Refund.');
                    await billingService.refundCredits(userPhone, billResult.costInCredits);
                }
                
                toolResponses.push({ functionResponse: { name: call.name, response: toolResult } });
            }

            if (toolResponses.length > 0) {
                const finalHistory = [...toolHistory, { role: 'function', parts: toolResponses }] as AIMessage[];
                const followUp = await ai.chat(finalHistory, "Continue based on tool results.", {
                    model: primaryModel,
                    systemInstruction: systemPrompt,
                    tools
                });
                text = followUp.text;
                if (followUp.thinking) {
                    logger.info({ userPhone: userPhone, thinking: followUp.thinking }, '🧠 [Agentic Thought - FollowUp]');
                }
            }
        }

        if (text) {
                await billingService.billForMessage(userPhone);
                await whatsappService.sendText(userPhone, Formatter.format(text), ctx.phoneId);
                const safeUserMessage = ctx.message ? redactPII(ctx.message) : (ctx.type === 'text' ? '[Empty Message]' : (isImage ? '[Image]' : isDoc ? '[Document]' : isAudio ? '[Audio]' : `[${ctx.type.toUpperCase()}]`));
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
    const { userPhone, slmReport, chatId: resumeChatId, sector, orgId, phoneId } = job.data;
    
    // Guard against missing chatId (e.g. from legacy SLM jobs queued before fix)
    if (!resumeChatId) {
        logger.error({ userPhone, sector }, '❌ Life Chat Resume missing chatId — skipping save');
        return { success: false, error: 'MISSING_CHAT_ID' };
    }
    
    const org = await getOrgById(orgId || 'naija-agent-master');
    const { lifeMemory } = await import('../services/lifeMemory.js');
    const lifeContext = await lifeMemory.getContext(userPhone);
    const energyCredits = lifeContext.energyCredits ?? 0;
    
    const soulPrompt = promptService.getPrompt('Aelixxr.Soul.md');
    const systemPrompt = `${soulPrompt}\n\n[CONTEXT]: Resuming task from ${sector}.\n- Energy: ${energyCredits}`;

    const { primaryModel } = await getDynamicModels(systemPrompt);
    const history = await getChatHistory(resumeChatId, 10);
    const normalizedHistory: AIMessage[] = history.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const resumeInstruction = `
[SOVEREIGN WITNESS HOOK]:
A technical agent (${sector}) has completed a delegated task. 
RAW REPORT:
${slmReport}

INSTRUCTION:
1. Inspect the report above for technical success or failure.
2. Verify if it aligns with the user's original goal.
3. If it contains errors or sensitive data leaks, flag them.
4. Synthesize the final outcome for the user in your cultural Aelixxr persona. 
DO NOT just repeat the report; provide the 'So What?' for the user's life.`;

    const result = await ai.chat(normalizedHistory, resumeInstruction, {
        model: primaryModel,
        systemInstruction: systemPrompt
    });

    if (result.text) {
        await whatsappService.sendText(userPhone, Formatter.format(result.text), phoneId);
        await saveMessage(resumeChatId, { role: 'assistant', content: result.text, type: 'text' });
    }

    return { success: true };
}
