import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import 'dotenv/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { SystemConfig, formatCurrency } from '@naija-agent/types';
import { deductBalance, getOrgById, getChatHistory, findOrCreateChat, saveMessage } from '@naija-agent/firebase';
import { ingestDocument } from '@naija-agent/storage';
import { logger } from './utils/logger.js';
import { marketService } from './services/marketData.js';
import { lifeMemory } from './services/lifeMemory.js';
import { getLifeTools, executeLifeTool } from './tools.js';
import { whatsappService } from './services/whatsapp.js';
import { heartbeatService } from './services/heartbeat.js';
import { proactiveService } from './services/proactive.js';
import fs from 'fs';
import path from 'path';

// --- Load Aelixxr Soul Prompt (Cached in RAM) ---
let aelixxrSoulPrompt = '';
try {
    const promptPath = path.join(__dirname, 'prompts', 'Aelixxr.Soul.md');
    aelixxrSoulPrompt = fs.readFileSync(promptPath, 'utf-8');
    logger.info('🧠 Loaded Aelixxr.Soul.md into RAM');
} catch (e: any) {
    logger.error('Failed to load Aelixxr.Soul.md. Worker may crash on chat.');
}

// --- Billing Configuration ---
const TOOL_COSTS: Record<string, number> = {
    'generate_quiz': 0, // Free (Loss Leader)
    'search_vault': 0, // Free for now (User Retention)
    'save_note': 0,
    'delete_from_vault': 0,
    'generate_invite': 0,
    'log_feedback': 0,
    'update_life_context': 0,
    'web_search': 3000,
};

// --- Redis Configuration for Life Engine (LOS) ---
const redisUrl = process.env.REDIS_URL_LOS || process.env.REDIS_URL; 
let redisConfig: any;
let redisClient: any; // We only use it for Queue connection options here, but BullMQ accepts ioredis instances.
// Wait, BullMQ's connection option accepts an object OR an IORedis instance.

if (redisUrl) {
  const commonOptions = {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 100, 3000)
  };
  if (redisUrl.startsWith('rediss://')) {
      redisConfig = { ...commonOptions, tls: { rejectUnauthorized: false } };
  } else {
      redisConfig = commonOptions;
  }
  // BullMQ will instantiate its own connections using redisConfig or we pass an instance.
  // We'll pass the instance to connection to ensure TLS works flawlessly.
  redisClient = new Redis(redisUrl, redisConfig);
} else {
  logger.warn('⚠️ REDIS_URL_LOS not set. Using localhost default.');
  redisConfig = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  redisClient = new Redis(redisConfig);
}

// --- AI Configuration ---
const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY;
if (!apiKey) {
  logger.warn('⚠️ GEMINI_API_KEY_LOS is missing. Using MOCK mode for testing.');
} else {
  logger.info('🔑 Gemini API Key found.');
}

const genAI = new GoogleGenerativeAI(apiKey || 'mock-key');

// --- Bootstrapping MCP Server (Phase 1) ---
import { mcpClient } from './services/mcpClient.js';

let globalLifeTools: any[] | null = null;

(async () => {
  try {
    logger.info('🔌 Bootstrapping Stateless MCP Server (Local)...');
    
    // Instead of using `npx` over the network, we execute a local node script 
    // to act as the fetch server, eliminating boot friction and crash risk.
    const scriptPath = path.join(__dirname, 'utils', 'mcp-fetch.mjs');
    await mcpClient.connectLocalServer('node', [scriptPath]);

    // Pre-fetch tools into cache to avoid IPC latency on every message
    globalLifeTools = await getLifeTools();
    logger.info('✅ Dynamic Tools Cached Successfully');
  } catch (error: any) {
    logger.error({ error: error.message }, '⚠️ Failed to bootstrap MCP server, Aelixxr will run with native tools only.');
    globalLifeTools = await getLifeTools(); // Fallback to native tools
  }
})();

async function getDynamicModels(systemInstruction?: string) {
  const tools = globalLifeTools || await getLifeTools();

  const primaryModel = genAI.getGenerativeModel({ 
    model: process.env.GEMINI_MODEL_LOS || SystemConfig.MODELS.AELIXXR_PRIMARY,
    tools,
    systemInstruction
  });

  const fallbackModel = genAI.getGenerativeModel({ 
    model: SystemConfig.MODELS.AELIXXR_FALLBACK,
    tools,
    systemInstruction
  });

  return { primaryModel, fallbackModel };
}

// --- Queue Setup ---
const lifeQueue = new Queue('life-queue', { connection: redisClient });

// --- Worker Setup ---
const worker = new Worker(
  'life-queue',
  async (job: Job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing Life Task');

    try {
        switch (job.name) {
            case 'proactive-nudge':
                logger.info('🤝 Processing Proactive Nudge (AI4Service Phase)...');
                const staleUsers = await proactiveService.getUsersNeedingNudge(48); // 48 hours
                logger.info({ count: staleUsers.length }, 'Found users needing a proactive nudge');
                
                for (const userId of staleUsers) {
                    await worker.rateLimit(10);
                    
                    const evalJobData = {
                        userId,
                        timestamp: Date.now()
                    };
                    
                    await lifeQueue.add('evaluate-nudge', evalJobData, {
                        jobId: `nudge-${userId}-${Date.now()}`,
                        removeOnComplete: true,
                        removeOnFail: false
                    });
                    logger.info({ userId }, 'Queued evaluate-nudge job');
                }
                return { success: true, queuedUsers: staleUsers.length };

            case 'evaluate-nudge':
                logger.info('🔍 Evaluating Individual Proactive Nudge...');
                const nudgeUserId = job.data.userId;
                
                try {
                    const context = await lifeMemory.getContext(nudgeUserId);
                    const episodic = await lifeMemory.getRecentEpisodicEvents(nudgeUserId, 3);
                    
                    const systemPrompt = `
                    You are "Aelixxr", the Life Companion.
                    This is a PROACTIVE NUDGE. The user hasn't spoken to you in 48 hours.
                    User Context:
                    - Family: ${JSON.stringify(context.family || {})}
                    - Goals: ${JSON.stringify(context.goals || [])}
                    - Recent Events (Vault): ${JSON.stringify(episodic)}
                    
                    Your Goal: You must act with "Proactive Agency". Draft a warm, contextual message checking in on them. Reference their recent events or goals if relevant. DO NOT be sycophantic. Be a true companion checking in.
                    
                    [RESPONSE FORMATTING - CRITICAL]:
                    - Wrap all internal thoughts inside <think> ... </think> tags.
                    - Only output the final conversational message outside the tags.
                    - Do NOT output 'SKIP'. You MUST send a message.
                    `;
                    
                    const { primaryModel } = await getDynamicModels(systemPrompt);
                    const chatSession = primaryModel.startChat({ history: [] });
                    const result = await chatSession.sendMessage("Generate proactive nudge message.");
                    
                    let text = result.response.text().trim();
                    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    if (text.includes('<think>')) {
                        text = text.split('<think>')[0].trim();
                    }
                    
                    if (text !== '') {
                        logger.info({ userId: nudgeUserId }, 'Proactive nudge generated');
                        await whatsappService.sendText(nudgeUserId, text);
                        // Update semantic memory so we don't spam them immediately again
                        await lifeMemory.updateContext(nudgeUserId, {}); 
                    }
                } catch (err: any) {
                    logger.error({ userId: nudgeUserId, err: err.message }, 'Failed to evaluate nudge');
                    throw err;
                }
                return { success: true };

            case 'life-heartbeat':
                logger.info('💓 Processing Life Heartbeat (Fan-out Phase)...');
                const activeUsers = await heartbeatService.getAllActiveUsers();
                logger.info({ count: activeUsers.length }, 'Found users with active heartbeats');
                
                // Fan-out: Push individual evaluation jobs back to the queue
                // This prevents 1,000 heartbeats from blocking the worker loop.
                for (const userId of activeUsers) {
                    await worker.rateLimit(10); // Simple yielding
                    
                    const configs = await heartbeatService.getUserConfigs(userId);
                    for (const config of configs) {
                        const evalJobData = {
                            userId,
                            config,
                            timestamp: Date.now()
                        };
                        
                        await lifeQueue.add('evaluate-heartbeat', evalJobData, {
                            jobId: `eval-${userId}-${config.id}-${Date.now()}`,
                            removeOnComplete: true,
                            removeOnFail: false
                        });
                        logger.info({ userId, configId: config.id }, 'Queued evaluate-heartbeat job');
                    }
                }
                
                return { success: true, queuedUsers: activeUsers.length };

            case 'evaluate-heartbeat':
                logger.info('🔍 Evaluating Individual Heartbeat Config...');
                const { userId, config } = job.data;
                
                try {
                    const { shouldMessage, contextData } = await heartbeatService.evaluateConfig(config);
                    if (shouldMessage) {
                        const context = await lifeMemory.getContext(userId);
                        const systemPrompt = `
                        You are "Aelixxr", the Life Companion.
                        This is a PROACTIVE message. The user did not speak to you.
                        You are checking their active heartbeat config: ${JSON.stringify(config)}
                        Here is the latest data for this config: ${JSON.stringify(contextData)}
                        User Context:
                        - Family: ${JSON.stringify(context.family || {})}
                        - Goals: ${JSON.stringify(context.goals || [])}
                        
                        Your Goal: Analyze the latest data against their config. If it warrants an alert (e.g. price dropped, or a reminder is due), draft a short, friendly WhatsApp message to them. 
                        If no alert is needed, you MUST reply with exactly "SKIP" and nothing else.

                        [RESPONSE FORMATTING - CRITICAL]:
                        - Wrap all internal thoughts and reasoning inside <think> ... </think> tags.
                        - Only output the final conversational message outside the tags.
                        - If you decide not to send a message, output exactly "SKIP" outside the tags.
                        `;
                        
                        const { primaryModel } = await getDynamicModels(systemPrompt);
                        const chatSession = primaryModel.startChat({
                            history: []
                        });
                        
                        const result = await chatSession.sendMessage("Evaluate and generate proactive message or SKIP.");
                        let text = result.response.text().trim();
                        
                        // Extract everything outside <think> tags
                        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    if (text.includes('<think>')) {
                        text = text.split('<think>')[0].trim();
                    }
                        
                        if (text !== 'SKIP' && text !== '') {
                            logger.info({ userId }, 'Proactive heartbeat message generated');
                            await whatsappService.sendText(userId, text);
                        } else {
                            logger.info({ userId }, 'Heartbeat evaluated: SKIP');
                        }
                    }
                } catch (err: any) {
                    logger.error({ userId, err: err.message }, 'Failed heartbeat evaluation for user');
                    throw err; // Re-throw to let BullMQ handle retries/failures
                }
                
                return { success: true };

            case 'market-scrape':
                logger.info('🛒 Scraping Market Prices...');
                const prices = await marketService.getPrices();
                logger.info({ count: prices.length }, '✅ Market Prices Retrieved');
                return { success: true, prices };
            
            case 'life-chat':
                const { userPhone, message, orgId, imageId, documentId } = job.data; 
                logger.info({ userPhone, orgId, hasImage: !!imageId, hasDoc: !!documentId }, '🧠 Thinking about Life...');

                const org = orgId ? await getOrgById(orgId) : null;
                const currency = org?.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
                
                // --- 0. REFERRAL INTERCEPTOR ---
                let referralSummary = "";
                const referralMatch = message ? message.match(/friend\s+(\+?\d+)\s+invited/i) : null;
                
                if (referralMatch) {
                    const rawReferrerPhone = referralMatch[1];
                    // Very basic normalization (strip '+', allow just numbers). Note: Should ideally use a strict E.164 normalizer
                    const referrerPhone = rawReferrerPhone.replace(/\D/g, ''); 
                    
                    if (referrerPhone === userPhone.replace(/\D/g, '')) {
                        logger.warn({ userPhone }, '🚨 Blocked Self-Referral Exploit');
                    } else {
                        const isNewUser = !(await lifeMemory.checkExists(userPhone));
                        const referrerExists = await lifeMemory.checkExists(referrerPhone);
                        
                        if (isNewUser && referrerExists) {
                            logger.info({ newPhone: userPhone, referrerPhone }, '🎉 Valid Referral Detected!');
                            
                            // Give Referrer +10
                            await lifeMemory.addEnergy(referrerPhone, 10);
                            await whatsappService.sendText(referrerPhone, `Oga! Your friend (${userPhone}) just joined us using your link. I'm feeling energized! I just added 10 units of energy to my battery. Thank you! 🔋⚡`);
                            
                            // Let the system know to grant the new user +10 on top of the welcome bonus
                            // The Welcome Bonus (100) will be granted in the getContext() call right after this.
                            referralSummary = `\n\n[SYSTEM UPDATE]: You have successfully applied their friend's referral code. They have received an extra 10 Energy Credits! Welcome them warmly.`;
                            await lifeMemory.updateContext(userPhone, { energyCredits: 110 }); // Pre-seed with 110. getContext will just return it.
                        } else if (!isNewUser) {
                            logger.warn({ userPhone }, 'Blocked Late-Referral Exploit (User already exists)');
                        } else if (!referrerExists) {
                            logger.warn({ userPhone, referrerPhone }, 'Blocked Ghost-Referral Exploit (Referrer does not exist)');
                        }
                    }
                }

                // 1. Retrieve Long-Term Memory & Energy Balance (Triggers Welcome Bonus if new)
                const context = await lifeMemory.getContext(userPhone);
                const energyCredits = context.energyCredits ?? 0;
                
                // Keep them marked as active to prevent proactive nudges
                await lifeMemory.updateContext(userPhone, {});

                // --- SHORT CIRCUIT: BATTERY DEAD ---
                if (energyCredits <= -2) {
                    logger.warn({ userPhone, energyCredits }, '🔋 Battery critically dead. Short-circuiting request.');
                    const deadMessage = `Oga, my battery is completely dead right now! 🪫 I'm officially 'sleeping' and can't process any messages until you plug me in. Please use your portal to recharge me so we can continue chatting!`;
                    await whatsappService.sendText(userPhone, deadMessage);
                    return { success: false, reason: 'insufficient_energy' };
                }

                if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === 'mock-key') {
                    logger.warn('⚠️ Using Mock Response due to missing/invalid API Key');
                    // Simulate Gemini deciding to call the tool
                    logger.info('🛠️ AI requested tools... (Simulated)');
                    const toolResult = await executeLifeTool('get_market_prices', {});
                    const mockReply = `(Mock AI) The current price of Rice is ${formatCurrency(toolResult[0].price, currency.locale, currency.code)}.`;
                    return { success: true, reply: mockReply };
                }

                try {
                    // 0. AUTO-INGESTION (The Vault)
                    let ingestionSummary = "";
                    if (imageId || documentId) {
                        try {
                           logger.info('📥 Auto-Ingesting Media to Vault...');
                           const mediaId = imageId || documentId;
                           const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);
                           
                           const doc = await ingestDocument(userPhone, buffer, mimeType, apiKey, {
                               orgId,
                               caption: message, // Use the user's message as the caption for context
                               originalMediaId: mediaId
                           });
                           ingestionSummary = `\n\n[SYSTEM UPDATE]: I have saved this document to your Vault.\nTitle: ${doc.title}\nCategory: ${doc.type}\nSummary: ${doc.summary}\nID: ${doc.id}`;
                           logger.info({ docId: doc.id }, '✅ Saved to Vault');

                           // (SEEM Architecture): Log the ingestion as an episodic event
                           await lifeMemory.saveEpisodicEvent(
                               userPhone,
                               `Vault Ingestion: ${doc.type}`,
                               `User uploaded a document/image titled "${doc.title}". AI Summary: ${doc.summary}`,
                               'neutral'
                           );
                        } catch (ingestErr: any) {
                           logger.error({ error: ingestErr.message }, '❌ Vault Ingestion Failed');
                           ingestionSummary = `\n\n[SYSTEM ERROR]: I tried to save this to your Vault but failed. Error: ${ingestErr.message}`;
                        }
                    }

                    const activeMonitors = await heartbeatService.getUserConfigs(userPhone);
                    
                    // 2. Construct Prompt with Context
                    const systemPrompt = `
${aelixxrSoulPrompt}
                    
---
[DYNAMIC SYSTEM CONTEXT]:
- Current Server Time (UTC): ${new Date().toUTCString()}
- Currency: ${currency.code} (${currency.symbol})
- Locale: ${currency.locale}
- Current Energy Credits: ${energyCredits} units left.

User Context:
- Family: ${JSON.stringify(context.family || {})}
- Goals: ${JSON.stringify(context.goals || [])}
- Preferences: ${JSON.stringify(context.preferences || {})}

[ACTIVE MONITORS & REMINDERS]:
You have set up the following proactive monitors for the user. If they ask about their reminders or alerts, reference this list:
${activeMonitors.length > 0 ? JSON.stringify(activeMonitors) : "None currently active."}
---
`;

                    // 3. Generate Content (Reasoning) with Fallback Strategy
                    let chatSession;
                    let result;

                    const chatId = await findOrCreateChat(orgId || 'naija-agent-master', `${userPhone}_life`, 'User');
                    const history = await getChatHistory(chatId, 10);
                    
                    // --- STRICT ROLE NORMALIZATION ---
                    let chatHistory = history.map((msg: any) => ({
                        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
                        parts: [{ text: msg.content }],
                    }));

                    // Remove leading model messages (Gemini/Gemma requirement)
                    while (chatHistory.length > 0 && chatHistory[0].role === 'model') {
                        chatHistory.shift();
                    }

                    // Ensure strictly alternating roles (User -> Model -> User)
                    const alternatingHistory = [];
                    let lastRole = null;
                    for (const msg of chatHistory) {
                        if (msg.role !== lastRole) {
                            alternatingHistory.push(msg);
                            lastRole = msg.role;
                        } else {
                            // Merge consecutive same-role messages or skip
                            alternatingHistory[alternatingHistory.length - 1].parts[0].text += "\n" + msg.parts[0].text;
                        }
                    }
                    
                    chatHistory = alternatingHistory;

                    // If history ends with user, Gemini will append the new message correctly.
                    // But if we use sendMessage, we usually want history to be empty or end with model.
                    // Actually, startChat(history) where history ends with model is best for sendMessage(user).
                    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
                        // We will append the current message to the last user message or just pass empty and let sendMessage handle it.
                        // Best practice for Gemini: if last is user, pop it and merge with the current message.
                        const lastUserMsg = chatHistory.pop();
                        logger.info({ lastMsg: lastUserMsg?.parts[0].text }, 'Merging last user history with current message');
                    }

                    logger.info({ historyLength: chatHistory.length }, '🚀 Sending normalized chat history to AI');

                    // Append ingestion summary and referral summary to user message so AI knows what happened
                    const fullMessage = message + ingestionSummary + referralSummary;

                    const { primaryModel, fallbackModel } = await getDynamicModels(systemPrompt);

                    try {
                        chatSession = primaryModel.startChat({ history: chatHistory });
                        result = await chatSession.sendMessage(fullMessage);
                    } catch (primaryError: any) {
                        if (primaryError.message.includes('429') || primaryError.message.includes('503') || primaryError.message.includes('fetch failed') || primaryError.message.includes('500')) {
                            logger.warn('⚠️ Primary Life Model Failed. Switching to Fallback.');
                            chatSession = fallbackModel.startChat({ history: chatHistory });
                            result = await chatSession.sendMessage(fullMessage);
                        } else {
                            throw primaryError;
                        }
                    }

                    const response = result.response;
                    let text = response.text();
                    
                    try {
                        const parsed = JSON.parse(text);
                        text = parsed.whatsapp_message || text;
                    } catch (e) {
                        // Expected if AI drops JSON mode to perform native function calling
                    }
                    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    if (text.includes('<think>')) {
                        text = text.split('<think>')[0].trim();
                    }

                    // 4. Tool Execution (Function Calling) with SMART ENERGY (BILLING)
                    const functionCalls = response.functionCalls();
                    let billingNote = "";

                    if (functionCalls && functionCalls.length > 0) {
                        logger.info('🛠️ AI requested tools...');
                        for (const call of functionCalls) {
                            // --- SUPERVISOR DELEGATION INTERCEPTOR ---
                            if (call.name === 'delegate_task') {
                                const args = call.args as any;
                                logger.info({ sector: args.sector }, '🔀 Orchestrator delegating task to SLM...');
                                
                                await lifeQueue.add('execute-slm-task', {
                                    orgId,
                                    userPhone,
                                    chatId,
                                    originalMessage: message,
                                    sector: args.sector,
                                    instruction: args.instruction,
                                    energyCredits,
                                    timestamp: Date.now()
                                }, { removeOnComplete: true, removeOnFail: false });

                                const interimMsg = `I'm on it! Let me consult my ${args.sector?.replace('Pack', '') || 'expert'} to handle that for you... ⏳`;
                                await whatsappService.sendText(userPhone, interimMsg);
                                
                                await saveMessage(chatId, { role: 'user', content: message, type: 'text' });
                                await lifeMemory.deductEnergy(userPhone, 1);
                                
                                return { success: true, delegated: true, interimMsg };
                            }

                            // Phase 4: Dynamic Billing Map
                            // If a tool is not explicitly defined in TOOL_COSTS, we assume it is a 3rd-party MCP tool 
                            // and charge a default execution cost (e.g. 3000 Kobo = 3 Credits) to prevent API drain.
                            const isUnknownMcpTool = !(call.name in TOOL_COSTS);
                            const cost = isUnknownMcpTool ? 3000 : TOOL_COSTS[call.name];
                            const costInCredits = cost / 1000;
                            
                            // 🛡️ SECURITY: Enforce Billing Identity
                            if (cost > 0) {
                                logger.info({ tool: call.name, cost, energyCredits }, '🔋 Attempting energy deduction...');
                                
                                // Emergency Reserve Check (Soft Bounce)
                                if (energyCredits <= 0) {
                                     text = `Here is what I was trying to do, but my battery actually hit 0% right now! I'd love to use my tools for you, but I'm officially 'sleeping'. Please use your portal to recharge me so we can continue! 🔋💤`;
                                     break;
                                }

                                const newBalance = await lifeMemory.deductEnergy(userPhone, costInCredits);
                                
                                if (newBalance === null) {
                                    text = `I'd love to help with this, but it takes a lot of energy (${costInCredits} units) and my battery is too low right now. Can we recharge quickly so I can get to work? 🔋🔌`;
                                    break; // Stop execution
                                }
                                billingNote += `\n_(-${costInCredits} Energy used for deep search)_`;
                            }

                            // Inject userId and context for tools that need it
                            const args = { ...call.args, userId: userPhone, sessionId: chatId, originalMessage: message };
                            const toolResult = await executeLifeTool(call.name, args);

                            // 🛡️ API SAFETY: Google Protobuf requires function responses to be Objects, not naked Arrays/Primitives.
                            let safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult)) 
                                ? toolResult 
                                : { result: toolResult };
                            
                            // 🛡️ CONTEXT RE-INJECTION: Prevent hallucination on tool failure
                            if (safeResponse.error) {
                                safeResponse.system_context = `The tool execution failed. Please apologize to the user. Remember, their original request was: "${message}".`;
                            }
                            
                            // Return the tool result to the AI model so it can formulate a final answer
                            const followUpResult = await chatSession.sendMessage([{
                                functionResponse: {
                                    name: call.name,
                                    response: safeResponse
                                }
                            }]);
                            
                            let followUpText = followUpResult.response.text(); 
                            try {
                                const parsed = JSON.parse(followUpText);
                                text = parsed.whatsapp_message || followUpText;
                            } catch (e) {
                                // Expected if AI uses plain text with <think> tags
                                text = followUpText;
                            }
                            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    if (text.includes('<think>')) {
                        text = text.split('<think>')[0].trim();
                    }
                        }
                    }

                    text += billingNote; // Append energy notification
                    logger.info({ response: text }, '🗣️ Life Companion Replying');
                    
                    // Deduct 1 credit for standard message (Base Cost)
                    await lifeMemory.deductEnergy(userPhone, 1);

                    // Send via WhatsApp
                    await whatsappService.sendText(userPhone, text);

                    // Save conversation history to the database
                    await saveMessage(chatId, { 
                        role: 'user', content: message, type: 'text' 
                    });
                    await saveMessage(chatId, { 
                        role: 'assistant', content: text, type: 'text' 
                    });
                    
                    return { success: true, reply: text };
                } catch (apiError: any) {
                    logger.error({ error: apiError.message }, '❌ Gemini API Call Failed');
                    
                    // --- SOVEREIGN SNITCH: Brain Freeze Alert ---
                    try {
                        const masterPhone = process.env.MASTER_ADMIN_PHONE || '2347042310893';
                        const brainSnitch = `🚨 *AELIXXR BRAIN FREEZE*\n\n*User:* ${userPhone}\n*Error:* ${apiError.message}\n\nOga, Gemini is acting up. I've told the user to join the feedback group.`;
                        await whatsappService.sendText(masterPhone, brainSnitch);
                    } catch (sErr) {}

                    // --- Community Error Message ---
                    const communityLink = 'https://chat.whatsapp.com/IOSJQNPgIHPBcamromxjp2';
                    const errorMsg = `Oga, my tools and brain dey act a bit strange right now. 🔋🧊 I've already alerted the Boss to fix it, but if you want to report it yourself or see when I'm back up, join our Aelixxr Feedback Group here: ${communityLink}\n\nI'll be back online soon!`;
                    await whatsappService.sendText(userPhone, errorMsg);
                    
                    throw apiError;
                }

            case 'execute-slm-task':
                logger.info('🤖 Starting SLM Worker...');
                const { sector, instruction: slmInst, originalMessage: slmOrig, userPhone: slmPhone, chatId: slmChatId } = job.data;
                
                let agentPrompt = '';
                try {
                    let agentFile = '';
                    if (sector === 'EducationPack') agentFile = 'StudyBuddy.Agent.md';
                    else if (sector === 'LifePack') agentFile = 'VaultClerk.Agent.md';
                    else if (sector === 'ResearchPack') agentFile = 'WebResearcher.Agent.md';
                    else agentFile = `${sector}.Agent.md`; // Fallback

                    const promptPath = path.join(__dirname, 'prompts', agentFile);
                    agentPrompt = fs.readFileSync(promptPath, 'utf-8');
                } catch (e: any) {
                    logger.error(`Failed to load ${sector} prompt: ${e.message}`);
                    agentPrompt = `You are an SLM worker for the ${sector}. Execute the instruction. Output valid JSON.`;
                }

                agentPrompt += `\n\nCRITICAL INSTRUCTION: Once you have completed your research and tool calls, you must output a FINAL REPORT in strictly valid JSON format matching this schema:
{
  "status": "success" | "error",
  "tool_used": "The name of the tool you used",
  "report": "A comprehensive but concise summary of your research findings or actions.",
  "data": [ { "title": "...", "content": "...", "metadata": {} } ] // Optional structured data points
}
Do not output any text after the JSON block.`;

                const fullInstruction = `
                [USER_ID]: ${slmPhone}
                [INSTRUCTION]: ${slmInst}
                `;

                const slmResponseSchema = {
                    type: SchemaType.OBJECT,
                    properties: {
                        status: {
                            type: SchemaType.STRING,
                            description: "The status of the task, e.g., 'success' or 'error'."
                        },
                        tool_used: {
                            type: SchemaType.STRING,
                            description: "The name of the tool you used to fulfill the instruction."
                        },
                        report: {
                            type: SchemaType.STRING,
                            description: "A comprehensive but concise summary of your research findings or actions."
                        },
                        data: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    title: { type: SchemaType.STRING },
                                    content: { type: SchemaType.STRING },
                                    metadata: { type: SchemaType.OBJECT }
                                }
                            },
                            description: "Optional. Structured data points, search results, or extracted facts."
                        }
                    },
                    required: ["status", "report"]
                };

                const slmModel = genAI.getGenerativeModel({
                    model: SystemConfig.MODELS.AELIXXR_WORKER, // 4B model for fast/cheap SLM execution
                    tools: globalLifeTools || await getLifeTools(), 
                    // Remove strict generationConfig to allow the SLM to execute tools naturally before formatting JSON.
                    // We will ask it to format as JSON in the prompt if it doesn't.
                });

                const slmChat = slmModel.startChat({
                    history: [{ role: 'user', parts: [{ text: agentPrompt }] }]
                });

                let slmReport = "SLM Task Failed to generate a report.";
                try {
                    const result = await slmChat.sendMessage(fullInstruction);
                    const response = result.response;
                    
                    const slmCalls = response.functionCalls();
                    if (slmCalls && slmCalls.length > 0) {
                        logger.info({ tool: slmCalls[0].name }, 'SLM Requested Tool...');
                        const call = slmCalls[0];
                        const args = { ...call.args, userId: slmPhone };
                        
                        const toolResult = await executeLifeTool(call.name, args);
                        
                        const safeResponse = (typeof toolResult === 'object' && toolResult !== null && !Array.isArray(toolResult)) 
                            ? toolResult 
                            : { result: toolResult };

                        const followUp = await slmChat.sendMessage([{
                            functionResponse: {
                                name: call.name,
                                response: safeResponse
                            }
                        }]);
                        slmReport = followUp.response.text();
                    } else {
                        slmReport = response.text();
                    }
                } catch (e: any) {
                    logger.error({ error: e.message }, 'SLM Worker Failed');
                    slmReport = JSON.stringify({ status: "error", report: "SLM crashed: " + e.message });
                }

                // Clean JSON aggressively
                let cleanedReport = slmReport;
                const jsonMatch = slmReport.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanedReport = jsonMatch[0];
                } else {
                    logger.warn('SLM failed to output valid JSON. Falling back to error report.');
                    cleanedReport = JSON.stringify({ status: "error", report: "Sub-agent failed to structure the data correctly." });
                }

                await lifeQueue.add('life-chat-resume', {
                    userPhone: slmPhone,
                    chatId: slmChatId,
                    originalMessage: slmOrig,
                    slmReport: cleanedReport,
                    sector
                }, { removeOnComplete: true, removeOnFail: false });

                return { success: true, slmReport: cleanedReport };

            case 'life-chat-resume':
                logger.info('🧠 Resuming Aelixxr Orchestration...');
                const { userPhone: resumePhone, originalMessage: resumeOrig, slmReport: resumeRep, chatId: resumeChatId, sector: resumeSector } = job.data;
                
                const resumeCurrency = { code: 'NGN', symbol: '₦', locale: 'en-NG' };
                const resumeContext = await lifeMemory.getContext(resumePhone);
                const resumeEnergy = resumeContext.energyCredits ?? 0;
                const resumeMonitors = await heartbeatService.getUserConfigs(resumePhone);

                const resumePrompt = `
${aelixxrSoulPrompt}
                    
---
[DYNAMIC SYSTEM CONTEXT]:
- Currency: ${resumeCurrency.code} (${resumeCurrency.symbol})
- Locale: ${resumeCurrency.locale}
- Current Energy Credits: ${resumeEnergy} units left.

User Context:
- Family: ${JSON.stringify(resumeContext.family || {})}
- Goals: ${JSON.stringify(resumeContext.goals || [])}
- Preferences: ${JSON.stringify(resumeContext.preferences || {})}

[ACTIVE MONITORS & REMINDERS]:
You have set up the following proactive monitors for the user. If they ask about their reminders or alerts, reference this list:
${resumeMonitors.length > 0 ? JSON.stringify(resumeMonitors) : "None currently active."}
---
`;
                const { primaryModel: resumePrimary } = await getDynamicModels(resumePrompt);
                const resumeHistory = await getChatHistory(resumeChatId, 10);
                
                // --- STRICT ROLE NORMALIZATION (Resume Block) ---
                let normalizedResumeHistory = resumeHistory.map((msg: any) => ({
                    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                }));

                while (normalizedResumeHistory.length > 0 && normalizedResumeHistory[0].role === 'model') {
                    normalizedResumeHistory.shift();
                }

                const altResumeHistory = [];
                let lastResumeRole = null;
                for (const msg of normalizedResumeHistory) {
                    if (msg.role !== lastResumeRole) {
                        altResumeHistory.push(msg);
                        lastResumeRole = msg.role;
                    } else {
                        altResumeHistory[altResumeHistory.length - 1].parts[0].text += "\n" + msg.parts[0].text;
                    }
                }
                normalizedResumeHistory = altResumeHistory;

                if (normalizedResumeHistory.length > 0 && normalizedResumeHistory[normalizedResumeHistory.length - 1].role === 'user') {
                    normalizedResumeHistory.pop(); // Pop so the new message becomes the 'user' turn
                }

                const resumeChatSession = resumePrimary.startChat({
                    history: normalizedResumeHistory
                });

                const resumeMessage = `
[USER_MESSAGE]: ${resumeOrig}

[SYSTEM UPDATE]: Your specialized sub-agent (${resumeSector}) has completed its research/task.
Below is the structured DATA REPORT from the sub-agent. 

[START OF SUB-AGENT REPORT]
${resumeRep}
[END OF SUB-AGENT REPORT]

[INSTRUCTION]:
1. Review the sub-agent's findings above.
2. Synthesize a warm, empathetic, and professional response to the user's original message.
3. If the sub-agent found data (like search results or a quiz), present it clearly and conversationally.
4. DO NOT mention you are an AI, do not mention the sub-agent, and do not mention JSON. 
5. Maintain your Aelixxr persona.
`;
                
                try {
                    const resumeRes = await resumeChatSession.sendMessage(resumeMessage);
                    let finalTxt = resumeRes.response.text();
                    try {
                        const parsed = JSON.parse(finalTxt);
                        finalTxt = parsed.whatsapp_message || finalTxt;
                    } catch(e) {}
                    
                    // Strip chain-of-thought leaked by Gemma 4
                    finalTxt = finalTxt.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    if (finalTxt.includes('<think>')) {
                        finalTxt = finalTxt.split('<think>')[0].trim();
                    }

                    logger.info({ response: finalTxt }, '🗣️ Life Companion Replying (Post-SLM)');
                    await whatsappService.sendText(resumePhone, finalTxt);
                    await saveMessage(resumeChatId, { role: 'assistant', content: finalTxt, type: 'text' });
                    
                    return { success: true, reply: finalTxt };
                } catch(e: any) {
                    logger.error('Failed to resume life chat', e);
                    
                    // --- SOVEREIGN SNITCH: Brain Freeze Alert (Resume) ---
                    try {
                        const masterPhone = process.env.MASTER_ADMIN_PHONE || '2347042310893';
                        const brainSnitch = `🚨 *AELIXXR BRAIN FREEZE (RESUME)*\n\n*User:* ${resumePhone}\n*Error:* ${e.message}\n\nOga, SLM-to-Aelixxr resume failed.`;
                        await whatsappService.sendText(masterPhone, brainSnitch);
                    } catch (sErr) {}

                    // --- Community Error Message ---
                    const communityLink = 'https://chat.whatsapp.com/IOSJQNPgIHPBcamromxjp2';
                    const errorMsg = `Oga, I consult my sub-agent finish but my brain freeze for the synthesis! 🔋🧊 I've already alerted the Boss. Join the Feedback Group for more info: ${communityLink}`;
                    await whatsappService.sendText(resumePhone, errorMsg);
                    
                    throw e;
                }

            default:
                logger.warn({ name: job.name }, 'Unknown Job Type');
                return { success: false, reason: 'Unknown Job' };
        }
    } catch (err: any) {
        logger.error({ jobId: job.id, error: err.message }, 'Life Task Failed');
        throw err;
    }
  },
  { 
    connection: redisClient, 
    concurrency: 5 
  }
);

worker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Life Worker Job Failed');
  
  // --- SOVEREIGN SNITCH: Critical System Alert ---
  try {
     const masterPhone = process.env.MASTER_ADMIN_PHONE || '2347042310893';
     const snitchMsg = `🚨 *SYSTEM ALERT (Life Worker)*\n\nJob *${job?.name}* (${job?.id}) failed!\n\nError: ${err.message}\n\nOga, please check the logs immediately.`;
     await whatsappService.sendText(masterPhone, snitchMsg);
     logger.info({ jobId: job?.id }, '🚨 [SNITCH] Life Worker failure reported to Boss.');
  } catch (snitchErr: any) {
     logger.error({ error: snitchErr.message }, 'Failed to snitch worker failure');
  }
});
