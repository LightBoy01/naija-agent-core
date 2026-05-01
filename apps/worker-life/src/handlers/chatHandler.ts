import { Job } from 'bullmq';
import { GoogleGenAI } from '@google/genai';
import { SystemConfig, formatCurrency } from '@naija-agent/types';
import { 
    getOrgById, 
    getChatHistory, 
    findOrCreateChat, 
    saveMessage 
} from '@naija-agent/firebase';
import { ingestDocument } from '@naija-agent/storage';
import { logger } from '../utils/logger.js';
import { lifeMemory } from '../services/lifeMemory.js';
import { executeLifeTool } from '../tools.js';
import { whatsappService } from '../services/whatsapp.js';
import { heartbeatService } from '../services/heartbeat.js';
import { billingService } from '../services/billingService.js';
import { promptService } from '../services/promptService.js';
import { Formatter } from '../utils/formatter.js';
import { normalizeHistory } from '../utils/ai.js';

export interface ChatDependencies {
    genAI: GoogleGenAI;
    getDynamicModels: (systemInstruction?: string) => Promise<any>;
    lifeQueue: any;
    apiKey: string;
    extractSafeText: (result: any) => string;
}

export async function handleLifeChat(job: Job, deps: ChatDependencies) {
    const { genAI, getDynamicModels, lifeQueue, apiKey, extractSafeText } = deps;
    const { userPhone, message, orgId, imageId, documentId, audioId } = job.data;
    
    logger.info({ userPhone, orgId, hasImage: !!imageId, hasDoc: !!documentId, hasAudio: !!audioId }, '🧠 Thinking about Life...');

    const org = orgId ? await getOrgById(orgId) : null;
    const currency = org?.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };

    // --- REFERRAL INTERCEPTOR ---
    let referralSummary = "";
    const referralMatch = message ? message.match(/(?:friend|referred|invited by)\s+(\+?\d+)/i) : null;
    
    if (referralMatch) {
        const rawReferrerPhone = referralMatch[1];
        const referrerPhone = rawReferrerPhone.replace(/\D/g, ''); 
        
        if (referrerPhone === userPhone.replace(/\D/g, '')) {
            logger.warn({ userPhone }, '🚨 Blocked Self-Referral Exploit');
        } else {
            const isNewUser = !(await lifeMemory.checkExists(userPhone));
            const referrerExists = await lifeMemory.checkExists(referrerPhone);
            
            if (isNewUser && referrerExists) {
                logger.info({ newPhone: userPhone, referrerPhone }, '🎉 Valid Referral Detected!');
                await lifeMemory.addEnergy(referrerPhone, 10);
                await whatsappService.sendText(referrerPhone, `Oga! Your friend (${userPhone}) just joined us using your link. I'm feeling energized! I just added 10 units of energy to my battery. Thank you! 🔋⚡`);
                referralSummary = `\n\n[SYSTEM UPDATE]: You have successfully applied their friend's referral code. They have received an extra 10 Energy Credits! Welcome them warmly.`;
                await lifeMemory.updateContext(userPhone, { energyCredits: 110 });
            }
        }
    }

    let context = await lifeMemory.getContext(userPhone);
    let energyCredits = context.energyCredits ?? 0;
    await lifeMemory.updateContext(userPhone, {});

    if (energyCredits <= -2) {
        logger.warn({ userPhone, energyCredits }, '🔋 Battery critically dead. Short-circuiting request.');
        const deadMessage = `Oga, my battery is completely dead right now! 🪫 I'm officially 'sleeping' and can't process any messages until you plug me in. Please use your portal to recharge me so we can continue chatting!`;
        await whatsappService.sendText(userPhone, deadMessage);
        return { success: false, reason: 'insufficient_energy' };
    }

    if (!apiKey || apiKey === 'mock-key') {
        const toolResult = await executeLifeTool('get_market_prices', {});
        const mockReply = `(Mock AI) The current price of Rice is ${formatCurrency(toolResult[0].price, currency.locale, currency.code)}.`;
        return { success: true, reply: mockReply };
    }

    try {
        let ingestionSummary = "";
        let audioTranscript = "";
        
        if (imageId || documentId || audioId) {
            try {
               logger.info('📥 Downloading Media...');
               const mediaId = imageId || documentId || audioId;
               const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);
               
               if (audioId) {
                   logger.info('🎙️ Vaulting & Transcribing Voice Note...');
                   const doc = await ingestDocument(userPhone, buffer, mimeType || 'audio/ogg', apiKey, {
                       orgId,
                       caption: message,
                       originalMediaId: mediaId
                   });
                   audioTranscript = doc.content || "";
                   ingestionSummary = `\n\n[SYSTEM UPDATE]: I have saved this Voice Note to your Vault.\nSummary: ${doc.summary}\nID: ${doc.id}`;
                   await lifeMemory.saveEpisodicEvent(userPhone, `Voice Memo`, `User sent a voice note. Summary: ${doc.summary}`, 'neutral');
               } else {
                   logger.info('📥 Auto-Ingesting Media to Vault...');
                   const doc = await ingestDocument(userPhone, buffer, mimeType, apiKey, {
                       orgId,
                       caption: message, 
                       originalMediaId: mediaId
                   });
                   const forensicResult = doc.extractedData?.forensicAnalysis || 'Not performed';
                   const forensicAlert = forensicResult.toUpperCase().includes('PASS') 
                       ? `\n🚨 [SYSTEM VERIFICATION]: PRE-SCREENED & AUTHENTIC. (Do not ask for image again).`
                       : `\n⚠️ [SYSTEM WARNING]: ${forensicResult}`;

                   ingestionSummary = `\n\n[SYSTEM UPDATE]: I have saved this document to your Vault.\nTitle: ${doc.title}\nCategory: ${doc.type}\nSummary: ${doc.summary}\nForensic Analysis: ${forensicResult}${forensicAlert}\nID: ${doc.id}`;
                   await lifeMemory.saveEpisodicEvent(userPhone, `Vault Ingestion: ${doc.type}`, `User uploaded a document/image titled "${doc.title}". AI Summary: ${doc.summary}`, 'neutral');
               }
            } catch (ingestErr: any) {
               logger.error({ error: ingestErr.message }, '❌ Media Processing Failed');
               ingestionSummary = `\n\n[SYSTEM ERROR]: I tried to process the file/audio you sent but failed. Error: ${ingestErr.message}`;
            }
        }

        const activeMonitors = await heartbeatService.getUserConfigs(userPhone);
        const now = new Date();
        const { getTimezoneFromPhone } = await import('../utils/timezone.js');
        const timezone = org?.timezone || getTimezoneFromPhone(userPhone);
        const localTime = now.toLocaleString('en-NG', { timeZone: timezone });

        // --- Phase 3: Hot-Reloading Soul Prompt ---
        const soulPrompt = promptService.getPrompt('Aelixxr.Soul.md');

        const systemPrompt = `
${soulPrompt}

---
[DYNAMIC SYSTEM CONTEXT]:
- Current UTC Time (ISO): ${now.toISOString()}
- Current UNIX Timestamp: ${now.getTime()} (Use this as your MATH BASE for relative time like "in 5 minutes").
- User Local Time: ${localTime} (${timezone})
- Currency: ${currency.code} (${currency.symbol})
- Locale: ${currency.locale}
- Current Energy Credits: ${energyCredits} units left.

User Context:
- Family: ${JSON.stringify(context.family || {})}
- Goals: ${JSON.stringify(context.goals || [])}
- Preferences: ${JSON.stringify(context.preferences || {})}

[TIMEKEEPING RULES]:
1. If the user asks for a relative time (e.g. "in 30 minutes"), add the duration to the Current UNIX Timestamp (${now.getTime()}) to get the triggerTime.
2. If the user specifies an absolute time (e.g. "at 5 PM"), use their Local Time (${localTime}) to determine the correct UNIX timestamp.
3. ALWAYS return UNIX timestamps in milliseconds.

[ACTIVE MONITORS & REMINDERS]:
You have set up the following proactive monitors for the user. If they ask about their reminders or alerts, reference this list:
${activeMonitors.length > 0 ? JSON.stringify(activeMonitors) : "None currently active."}
---
`;

        const chatId = await findOrCreateChat(orgId || 'naija-agent-master', `${userPhone}_life`, 'User');
        const history = await getChatHistory(chatId, 10);
        const { history: chatHistory, lastUserMessage } = normalizeHistory(history);

        const originalMessage = message || ""; 
        let fullMessage = originalMessage;

        if (lastUserMessage) {
            fullMessage = `[Previous Context]: ${lastUserMessage}\n\n${fullMessage}`;
        }

        if (audioTranscript) {
            fullMessage = `[VOICE NOTE TRANSCRIPT]: "${audioTranscript}"\n\n` + fullMessage;
        }
        fullMessage = fullMessage + ingestionSummary + referralSummary;

        const { primaryModel, fallbackModel, tools, systemInstruction } = await getDynamicModels(systemPrompt);
        const activeTools = (tools && tools[0]?.functionDeclarations?.length > 0) ? tools : undefined;

        let chatSession;
        let result;

        try {
            chatSession = genAI.chats.create({
                model: primaryModel,
                config: { systemInstruction, tools: activeTools },
                history: chatHistory
            });
            result = await chatSession.sendMessage({ message: fullMessage });
        } catch (primaryError: any) {
            if (primaryError.message.includes('429') || primaryError.message.includes('Quota')) {
                chatSession = genAI.chats.create({
                    model: fallbackModel,
                    config: { systemInstruction, tools: activeTools },
                    history: chatHistory
                });
                result = await chatSession.sendMessage({ message: fullMessage });
            } else {
                throw primaryError;
            }
        }

        let text = extractSafeText(result);
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (text.includes('<think>')) {
            text = text.split('<think>')[0].trim();
        }

        const functionCalls = result.functionCalls;
        let billingNote = "";

        if (functionCalls && functionCalls.length > 0) {
            let toolResponses: any[] = [];
            let shouldBreak = false;

            for (const call of functionCalls) {
                if (!call.name) continue;

                if (call.name === 'delegate_task') {
                    const args = call.args as any;
                    const slmHistorySummary = history.slice(-3).map((m: any) => `${m.role}: ${m.content}`).join('\n');
                    const enrichedInstruction = `[CONVERSATION CONTEXT]:\n${slmHistorySummary}\n\n[TASK]: ${args.instruction}`;

                    await lifeQueue.add('execute-slm-task', {
                        orgId,
                        userPhone,
                        chatId,
                        originalMessage: message,
                        sector: args.sector,
                        instruction: enrichedInstruction,
                        energyCredits,
                        timestamp: Date.now()
                    }, { removeOnComplete: true, removeOnFail: false });

                    const interimMsg = `I'm on it! Let me consult my ${args.sector?.replace('Pack', '') || 'expert'} to handle that for you... ⏳`;
                    await whatsappService.sendText(userPhone, interimMsg);
                    await saveMessage(chatId, { role: 'user', content: fullMessage, type: 'text' });
                    await billingService.billForMessage(userPhone);
                    return { success: true, delegated: true, interimMsg };
                }

                const billResult = await billingService.billForTool(userPhone, call.name, energyCredits);
                if (!billResult.success) {
                    text = billResult.errorText || "Insufficient energy.";
                    shouldBreak = true;
                    break;
                }
                
                if (billResult.costInCredits > 0) {
                    billingNote += `\n_(-${billResult.costInCredits} Energy used for ${call.name.replace(/_/g, ' ')})_`;
                    energyCredits = billResult.newBalance ?? energyCredits; 
                }

                const args = { ...call.args, userId: userPhone, sessionId: chatId, originalMessage: message };
                const toolResult = await executeLifeTool(call.name, args);
                let safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult)) 
                    ? toolResult 
                    : { result: toolResult };
                
                if (safeResponse.error) {
                    safeResponse.system_context = `The tool execution failed. Please apologize to the user. Remember, their original request was: "${message}".`;
                }
                
                toolResponses.push({
                    functionResponse: {
                        name: call.name,
                        response: safeResponse
                    }
                });
            }
            
            if (!shouldBreak && toolResponses.length > 0) {
                let followUpResult;
                try {
                    followUpResult = await chatSession.sendMessage({ message: toolResponses });
                } catch (toolError: any) {
                    if (toolError.message.includes('429') || toolError.message.includes('Quota')) {
                        const currentHistory = await chatSession.getHistory();
                        chatSession = genAI.chats.create({
                            model: fallbackModel,
                            config: { systemInstruction, tools: activeTools },
                            history: currentHistory
                        });
                        followUpResult = await chatSession.sendMessage({ message: toolResponses });
                    } else {
                        throw toolError;
                    }
                }
                let followUpText = extractSafeText(followUpResult); 
                text = followUpText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                if (text.includes('<think>')) {
                    text = text.split('<think>')[0].trim();
                }
            }
        }

        text += billingNote; 

        if (!text.trim() && (!functionCalls || functionCalls.length === 0)) {
            text = "Oga, I hear you, but my brain slow small. Can you say that again or try a different question?";
        }

        if (text.trim()) {
            await billingService.billForMessage(userPhone);
            const formattedText = Formatter.format(text);
            await whatsappService.sendText(userPhone, formattedText);
            const savedContent = audioTranscript ? `[VOICE NOTE]: ${audioTranscript}` : originalMessage;
            await saveMessage(chatId, { role: 'user', content: savedContent, type: 'text' });
            await saveMessage(chatId, { role: 'assistant', content: text, type: 'text' });
        }
        
        try {
            const existingJob = await lifeQueue.getJob(`sleep-${userPhone}`);
            if (existingJob) await existingJob.remove();
        } catch (e) {}

        await lifeQueue.add('consolidate-memory', { userId: userPhone, orgId }, {
            jobId: `sleep-${userPhone}`,
            delay: 1000 * 60 * 30,
            removeOnComplete: true,
            removeOnFail: false
        });                    
        return { success: true, reply: text };
    } catch (apiError: any) {
        logger.error({ error: apiError.message }, '❌ Gemini API Call Failed');
        try {
            const masterPhone = process.env.MASTER_ADMIN_PHONE || '2347042310893';
            const brainSnitch = `🚨 *AELIXXR BRAIN FREEZE*\n\n*User:* ${userPhone}\n*Error:* ${apiError.message}`;
            await whatsappService.sendText(masterPhone, brainSnitch);
        } catch (sErr) {}
        const communityLink = 'https://chat.whatsapp.com/IOSJQNPgIHPBcamromxjp2';
        const errorMsg = `Oga, my tools and brain dey act a bit strange right now. 🔋🧊 Join our Feedback Group: ${communityLink}`;
        await whatsappService.sendText(userPhone, errorMsg);
        throw apiError;
    }
}

export async function handleLifeChatResume(job: Job, deps: ChatDependencies) {
    const { genAI, getDynamicModels, lifeQueue, extractSafeText } = deps;
    const { userPhone, slmReport, chatId, sector, orgId } = job.data;
    
    const org = orgId ? await getOrgById(orgId) : null;
    const currency = org?.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
    const timezone = org?.timezone || 'Africa/Lagos';
    
    const context = await lifeMemory.getContext(userPhone);
    const energyCredits = context.energyCredits ?? 0;
    const monitors = await heartbeatService.getUserConfigs(userPhone);
    const now = new Date();
    const localTime = now.toLocaleString('en-NG', { timeZone: timezone });

    // --- Phase 3: Hot-Reloading Soul Prompt ---
    const soulPrompt = promptService.getPrompt('Aelixxr.Soul.md');

    const systemPrompt = `
${soulPrompt}

---
[DYNAMIC SYSTEM CONTEXT]:
- Current UTC Time: ${now.toISOString()}
- User Local Time: ${localTime} (${timezone})
- Currency: ${currency.code} (${currency.symbol})
- Locale: ${currency.locale}
- Current Energy Credits: ${energyCredits} units left.

User Context:
- Family: ${JSON.stringify(context.family || {})}
- Goals: ${JSON.stringify(context.goals || [])}
- Preferences: ${JSON.stringify(context.preferences || {})}

[ACTIVE MONITORS & REMINDERS]:
You have set up the following proactive monitors for the user.
${monitors.length > 0 ? JSON.stringify(monitors) : "None currently active."}
---
`;

    const { primaryModel, fallbackModel, tools } = await getDynamicModels(systemPrompt);
    const history = await getChatHistory(chatId, 10);
    const { history: chatHistory } = normalizeHistory(history);
    const activeTools = (tools && tools[0]?.functionDeclarations?.length > 0) ? tools : undefined;

    let chatSession;
    let result;

    try {
        chatSession = genAI.chats.create({
            model: primaryModel,
            config: { systemInstruction: systemPrompt, tools: activeTools },
            history: chatHistory
        });
    } catch (err) {
        // If session creation fails
        chatSession = genAI.chats.create({
            model: fallbackModel,
            config: { systemInstruction: systemPrompt, tools: activeTools },
            history: chatHistory
        });
    }

    const resumeInstruction = `
    [SUB-AGENT REPORT (${sector})]:
    ${slmReport}

    [INSTRUCTION]: You are Aelixxr. The user asked you a complex question, and you delegated it to a specialized sub-agent. 
    The sub-agent has now returned with its findings above.
    
    Your Goal: Synthesize this report for the user. Be empathetic, conversational, and helpful. 
    If the report indicates an "error" or "Insufficient energy", explain the situation clearly and offer to help with something else.
    Do NOT just copy-paste the report. Explain it in a way that matches your Aelixxr persona.
    `;

    try {
        result = await chatSession.sendMessage({ message: resumeInstruction });
    } catch (resumeError: any) {
        if (resumeError.message.includes('429') || resumeError.message.includes('Quota') || resumeError.message.includes('503')) {
            logger.warn('⚠️ Primary model failed on resume. Retrying with fallback.');
            chatSession = genAI.chats.create({
                model: fallbackModel,
                config: { systemInstruction: systemPrompt, tools: activeTools },
                history: chatHistory
            });
            result = await chatSession.sendMessage({ message: resumeInstruction });
        } else {
            throw resumeError;
        }
    }

    let text = extractSafeText(result);
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (text.includes('<think>')) {
        text = text.split('<think>')[0].trim();
    }

    // --- FALLBACK FOR EMPTY RESPONSES (Excellent Handling) ---
    if (!text.trim()) {
        logger.warn({ userPhone, sector }, '⚠️ AI generated empty response during resume. Using fallback.');
        text = "Oga, I don finish the research for you, but my brain slow small to explain am. My experts say everytin set, but if you need specific details, abeg ask me again!";
    }

    if (text.trim()) {
        await billingService.billForMessage(userPhone);
        const formattedText = Formatter.format(text);
        await whatsappService.sendText(userPhone, formattedText);
        await saveMessage(chatId, { role: 'assistant', content: text, type: 'text' });
    }

    return { success: true, reply: text };
}
