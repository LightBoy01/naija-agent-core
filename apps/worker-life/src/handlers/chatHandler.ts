import { Job } from 'bullmq';
import { parseAndFormatPhone } from '@naija-agent/types';
import { getOrgById } from '@naija-agent/firebase';
import { getChatHistory, saveMessage } from '@naija-agent/database';
import { logger } from '../utils/logger.js';
import { whatsappService } from '../services/whatsapp.js';
import { promptService } from '../services/promptService.js';
import { AIProvider, AIMessage } from '@naija-agent/ai';

import { LifePipeline } from '../pipeline/index.js';
import { ContextInterceptor } from '../pipeline/interceptors/context.js';
import { SecurityInterceptor } from '../pipeline/interceptors/security.js';
import { MediaInterceptor } from '../pipeline/interceptors/media.js';
import { SpamInterceptor } from '../pipeline/interceptors/spam.js';
import { redisClient } from '../index.js';

import { buildSystemPrompt, chatWithAelixxr } from './messageBuilder.js';
import { executeToolCalls, buildSafeUserMessage } from './toolExecutor.js';
import { sendResponse } from './responseSender.js';

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
    .use(MediaInterceptor);

export async function handleLifeChat(job: Job, deps: ChatDependencies) {
    const { ai, getDynamicModels, lifeQueue, apiKey } = deps;
    const rawPhone = job.data.userPhone || job.data.from || job.data.From;
    let userPhone = parseAndFormatPhone(rawPhone) || rawPhone;

    if (userPhone === '28364215738456@lid') {
        userPhone = '2347042310893';
    }
    const rawMessage = job.data.message !== undefined ? job.data.message : job.data.content?.text;
    let orgId = job.data.orgId;
    const type = (job.data.type === 'life-chat') ? 'text' : job.data.type;
    const fileName = job.data.content?.fileName;

    if (orgId === 'aelixxr') {
        orgId = 'aelixxr-life-companion';
    }

    let isImage = type === 'image' || type === 'video';
    let isDoc = type === 'document';
    let isAudio = type === 'audio';

    if (fileName && job.data.type === 'life-chat') {
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

    if (hops >= 3) {
        logger.warn({ userPhone, hops }, '🚫 [LOOP GUARD] Maximum delegation hops reached.');
        await whatsappService.sendText(userPhone, "Oga, I don try reach out to all my experts but we don dey loop too much! Make we try another way or simplify wetin you need. 🛑", phoneId);
        return { success: false, error: 'LOOP_GUARD_TRIGGERED' };
    }

    logger.info({ userPhone, orgId, hasImage: !!imageId, hasDoc: !!documentId, hasAudio: !!audioId, hops }, '🧠 Thinking about Life...');

    const initialContext = {
        job, userPhone, orgId, message: rawMessage, type: type || 'text',
        imageId, documentId, audioId, org: null, lifeContext: null,
        energyCredits: 0, timezone: '', localTime: '', activeMonitors: [],
        securitySummary: '', ingestionSummary: '',
        mediaBuffer: null, mediaMime: null,
        ai, phoneId, getDynamicModels, lifeQueue, apiKey, redisClient, shortCircuit: false
    };

    const ctx = await lifePipeline.execute(initialContext);

    if (ctx.isError) return { success: false, error: ctx.errorMessage };
    if (ctx.shortCircuit) return { success: false, reason: ctx.shortCircuitReason };

    // --- Interactive Multi-Agent Routing (Hermes Gateway) ---
    const activeAgent = ctx.lifeContext?.activeAgent || 'aelixxr';
    const overrideMatch = typeof rawMessage === 'string' && rawMessage.trim().toLowerCase().startsWith('!aelixxr');

    if (overrideMatch && activeAgent === 'hermes') {
        const { lifeMemory } = await import('../services/lifeMemory.js');
        await lifeMemory.updateContext(userPhone, { activeAgent: 'aelixxr' });
        logger.info({ userPhone }, '🔄 User triggered override. Switching activeAgent back to Aelixxr.');
        // Remove the command prefix so Aelixxr reads the rest of the message normally
        ctx.message = rawMessage.replace(/^!aelixxr\s*/i, '');
    } else if (activeAgent === 'hermes' && ctx.type === 'text' && typeof rawMessage === 'string') {
        const { proxyToHermes } = await import('../services/hermesProxy.js');
        const { lifeMemory } = await import('../services/lifeMemory.js');
        
        const hermesSessionId = ctx.lifeContext?.hermesSessionId;
        const proxyResult = await proxyToHermes(userPhone, rawMessage, hermesSessionId, phoneId);
        
        if (proxyResult.success && proxyResult.newSessionId && proxyResult.newSessionId !== hermesSessionId) {
            await lifeMemory.updateContext(userPhone, { hermesSessionId: proxyResult.newSessionId });
        }
        
        return { success: proxyResult.success };
    }

    try {
        const systemPrompt = await buildSystemPrompt(ai, ctx);
        const { result, chatId, primaryModel, normalizedHistory } = await chatWithAelixxr({ ctx, ai, getDynamicModels }, systemPrompt);

        whatsappService.sendTypingIndicator(userPhone).catch(e =>
            logger.warn({ error: e.message }, 'Failed to send typing indicator')
        );

        let text = result.text;
        const functionCalls = result.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
            const toolOutput = await executeToolCalls({
                functionCalls,
                ctx: { userPhone, phoneId: ctx.phoneId, energyCredits: ctx.energyCredits, message: ctx.message, type: ctx.type, isImage, isDoc, isAudio },
                ai, primaryModel, systemPrompt, chatId,
                jobId: job.id || '',
                normalizedHistory,
            });

            text = toolOutput.text || text;
            if (toolOutput.thinking) {
                logger.info({ userPhone, thinking: toolOutput.thinking }, '🧠 [Agentic Thought - FollowUp]');
            }
        }

        if (text) {
            const safeMsg = buildSafeUserMessage({ userPhone, energyCredits: ctx.energyCredits, message: ctx.message, type: ctx.type, isImage, isDoc, isAudio });
            await sendResponse({
                userPhone, phoneId: ctx.phoneId, text, chatId, ctxType: ctx.type,
                safeUserMessage: safeMsg, resultThinking: result.thinking
            });
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

    if (!resumeChatId) {
        logger.error({ userPhone, sector }, '❌ Life Chat Resume missing chatId — skipping save');
        return { success: false, error: 'MISSING_CHAT_ID' };
    }

    const org = await getOrgById(orgId || 'naija_agent_hq');
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
        await whatsappService.sendText(userPhone, result.text, phoneId);
        await saveMessage(resumeChatId, { role: 'assistant', content: result.text, type: 'text' });
    }

    return { success: true };
}
