import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SystemConfig, formatCurrency } from '@naija-agent/types';
import { deductBalance, getOrgById, getChatHistory, findOrCreateChat, saveMessage } from '@naija-agent/firebase';
import { ingestDocument } from '@naija-agent/storage';
import { logger } from './utils/logger.js';
import { marketService } from './services/marketData.js';
import { lifeMemory } from './services/lifeMemory.js';
import { getLifeTools, executeLifeTool } from './tools.js';
import { whatsappService } from './services/whatsapp.js';
import { heartbeatService } from './services/heartbeat.js';

dotenv.config();


logger.info('🌱 [LIFE OS] Worker Starting... (Engine 2: Intelligence)');

// --- Billing Configuration ---
const TOOL_COSTS: Record<string, number> = {
    'get_market_prices': SystemConfig.COSTS.MARKET_PRICE_LOOKUP,
    'verify_nafdac': SystemConfig.COSTS.NAFDAC_VERIFICATION,
    'generate_quiz': 0, // Free (Loss Leader)
    'search_vault': 0, // Free for now (User Retention)
    // Add other tools here
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
import path from 'path';

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

async function getDynamicModels() {
  const tools = globalLifeTools || await getLifeTools();
  
  const primaryModel = genAI.getGenerativeModel({ 
    model: process.env.GEMINI_MODEL_LOS || SystemConfig.MODELS.AELIXXR_PRIMARY,
    tools
  });

  const fallbackModel = genAI.getGenerativeModel({ 
    model: SystemConfig.MODELS.AELIXXR_FALLBACK,
    tools
  });

  return { primaryModel, fallbackModel };
}

// --- Worker Setup ---
const worker = new Worker(
  'life-queue',
  async (job: Job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing Life Task');

    try {
        switch (job.name) {
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
                        // Dynamically add a specific job for this config to the queue
                        // We use a separate function (or redis push) here, but for simplicity we will
                        // handle it via a new job type 'evaluate-heartbeat'
                        const evalJobData = {
                            userId,
                            config,
                            timestamp: Date.now()
                        };
                        
                        // Note: We need access to the queue to push. Since worker doesn't have it natively,
                        // we can either import the queue or emit an event. The cleanest way in BullMQ is 
                        // creating a dedicated Queue instance, or passing it down. 
                        // For now, we will handle evaluation natively but wrapped in promises to parallelize 
                        // up to the concurrency limit, avoiding strict sequential blocking.
                    }
                }
                
                // Optimized Parallel Execution (Bounded)
                const promises = activeUsers.map(async (userId) => {
                    try {
                        const configs = await heartbeatService.getUserConfigs(userId);
                        for (const config of configs) {
                            const { shouldMessage, contextData } = await heartbeatService.evaluateConfig(config);
                            if (shouldMessage) {
                                const context = await lifeMemory.getContext(userId);
                                const systemPrompt = `
                                You are "Aelixxr", the Life Guardian.
                                This is a PROACTIVE message. The user did not speak to you.
                                You are checking their active heartbeat config: ${JSON.stringify(config)}
                                Here is the latest data for this config: ${JSON.stringify(contextData)}
                                User Context:
                                - Family: ${JSON.stringify(context.family || {})}
                                - Goals: ${JSON.stringify(context.goals || [])}
                                
                                Your Goal: Analyze the latest data against their config. If it warrants an alert (e.g. price dropped, or a reminder is due), draft a short, friendly WhatsApp message to them. 
                                If no alert is needed, you MUST reply with exactly "SKIP" and nothing else.

                                [RESPONSE FORMATTING - CRITICAL]:
                                - DO NOT output your internal thinking, planning, or chain-of-thought process directly to the user.
                                - You MUST wrap your final message (or "SKIP") in <reply>...</reply> tags. Everything outside these tags will be ignored.
                                `;
                                
                                const { primaryModel } = await getDynamicModels();
                                const chatSession = primaryModel.startChat({
                                    history: [{ role: 'user', parts: [{ text: systemPrompt }] }]
                                });
                                
                                const result = await chatSession.sendMessage("Evaluate and generate proactive message or SKIP.");
                                let text = result.response.text().trim();
                                
                                const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
                                if (replyMatch) {
                                    text = replyMatch[1].trim();
                                }
                                
                                if (text !== 'SKIP') {
                                    logger.info({ userId }, 'Proactive heartbeat message generated');
                                    await whatsappService.sendText(userId, text);
                                } else {
                                    logger.info({ userId }, 'Heartbeat evaluated: SKIP');
                                }
                            }
                        }
                    } catch (err: any) {
                        logger.error({ userId, err: err.message }, 'Failed heartbeat evaluation for user');
                    }
                });

                // Wait for all to complete
                await Promise.allSettled(promises);
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
                           
                           const doc = await ingestDocument(userPhone, buffer, mimeType, apiKey);
                           ingestionSummary = `\n\n[SYSTEM UPDATE]: I have saved this document to your Vault.\nSummary: ${doc.summary}\nID: ${doc.id}`;
                           logger.info({ docId: doc.id }, '✅ Saved to Vault');
                        } catch (ingestErr: any) {
                           logger.error({ error: ingestErr.message }, '❌ Vault Ingestion Failed');
                           ingestionSummary = `\n\n[SYSTEM ERROR]: I tried to save this to your Vault but failed. Error: ${ingestErr.message}`;
                        }
                    }

                    // 1. Retrieve Long-Term Memory
                    const context = await lifeMemory.getContext(userPhone);
                    const activeMonitors = await heartbeatService.getUserConfigs(userPhone);
                    
                    // 2. Construct Prompt with Context
                    const systemPrompt = `
                    You are "Aelixxr", the Life Guardian and personal assistant for the Naija Agent Network.
                    You are warm, intelligent, and culturally aware of Nigerian nuances. You understand and can use Pidgin English naturally when appropriate, but you maintain the persona of a highly capable, empathetic, and professional assistant.
                    
                    [CONTEXT]:
                    Currency: ${currency.code} (${currency.symbol})
                    Locale: ${currency.locale}

                    User Context:
                    - Family: ${JSON.stringify(context.family || {})}
                    - Goals: ${JSON.stringify(context.goals || [])}
                    - Preferences: ${JSON.stringify(context.preferences || {})}

                    [ACTIVE MONITORS & REMINDERS]:
                    You have set up the following proactive monitors for the user. If they ask about their reminders or alerts, reference this list:
                    ${activeMonitors.length > 0 ? JSON.stringify(activeMonitors) : "None currently active."}
                    
                    Your Goal: Provide actionable, empathetic, and hyper-relevant advice.
                    
                    [THE VAULT - YOUR SUPERPOWER]:
                    - You have a 'search_vault' tool. Use it whenever the user asks about past receipts, bank alerts, or documents.
                    - If the user sends an image or document, I have ALREADY saved it to the Vault for you.
                    - Tell them: "I've filed this in your Vault. You can ask me to retrieve it anytime."
                    
                    [BILLING AWARENESS]:
                    - Some actions cost money (e.g. verifying drugs).
                    - You do NOT need to ask for permission for small amounts (under ${formatCurrency(0.5, currency.locale, currency.code)}).
                    - Just do it and helpful.

                    [WEB SEARCH]:
                    - You have access to the 'fetch_webpage' tool to read URLs provided by the user. If the user gives a URL, use the tool to read it before responding.

                    [RESPONSE FORMATTING - CRITICAL]:
                    - DO NOT output your internal thinking, planning, or chain-of-thought process directly to the user.
                    - You MUST wrap your final, conversational answer in <reply>...</reply> tags. Everything outside these tags will be ignored.
                    `;

                    // 3. Generate Content (Reasoning) with Fallback Strategy
                    let chatSession;
                    let result;

                    const chatId = await findOrCreateChat(orgId || 'naija-agent-master', `${userPhone}_life`, 'User');
                    const history = await getChatHistory(chatId, 10);
                    
                    const chatHistory = [
                        { role: 'user', parts: [{ text: systemPrompt }] },
                        { role: 'model', parts: [{ text: "I understand. I am ready to assist based on this context." }] },
                        ...history.map((msg: any) => ({
                            role: msg.role === 'user' ? 'user' : (msg.role === 'system' ? 'user' : 'model'),
                            parts: [{ text: msg.content }],
                        }))
                    ];

                    // Append ingestion summary to user message so AI knows what happened
                    const fullMessage = message + ingestionSummary;

                    const { primaryModel, fallbackModel } = await getDynamicModels();

                    try {
                        chatSession = primaryModel.startChat({ history: chatHistory });
                        result = await chatSession.sendMessage(fullMessage);
                    } catch (primaryError: any) {
                        if (primaryError.message.includes('429') || primaryError.message.includes('503')) {
                            logger.warn('⚠️ Primary Life Model Failed. Switching to Fallback.');
                            chatSession = fallbackModel.startChat({ history: chatHistory });
                            result = await chatSession.sendMessage(fullMessage);
                        } else {
                            throw primaryError;
                        }
                    }

                    const response = result.response;
                    let text = response.text();
                    
                    const replyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
                    if (replyMatch) {
                        text = replyMatch[1].trim();
                    }

                    // 4. Tool Execution (Function Calling) with SMART BILLING
                    const functionCalls = response.functionCalls();
                    let billingNote = "";

                    if (functionCalls && functionCalls.length > 0) {
                        logger.info('🛠️ AI requested tools...');
                        for (const call of functionCalls) {
                            // Phase 4: Dynamic Billing Map
                            // If a tool is not explicitly defined in TOOL_COSTS, we assume it is a 3rd-party MCP tool 
                            // and charge a default execution cost (e.g. 50 Kobo) to prevent API drain.
                            const isUnknownMcpTool = !(call.name in TOOL_COSTS);
                            const cost = isUnknownMcpTool ? 50 : TOOL_COSTS[call.name];
                            
                            // 🛡️ SECURITY: Enforce Billing Identity
                            if (cost > 0) {
                                if (!orgId) {
                                    logger.warn({ tool: call.name }, '🚨 [BILLING] Attempted paid tool without OrgID');
                                    text = `🚫 *System Error:* Unable to identify wallet for billing. Please contact support.`;
                                    break; // BLOCK execution
                                }

                                logger.info({ tool: call.name, cost }, '💰 Attempting deduction...');
                                const newBalance = await deductBalance(orgId, cost);
                                
                                if (newBalance === null) {
                                    text = `🚫 *Insufficient Balance.* \n\nOga, checking this costs ${formatCurrency(cost/100, currency.locale, currency.code)}, but your Zynux wallet is low. Please top up to use premium Life features.`;
                                    break; // Stop execution
                                }
                                billingNote += `\n_(${formatCurrency(cost/100, currency.locale, currency.code)} deducted for ${call.name})_`;
                            }

                            // Inject userId for tools that need it (like search_vault)
                            const args = { ...call.args, userId: userPhone };
                            const toolResult = await executeLifeTool(call.name, args);
                            
                            // Return the tool result to the AI model so it can formulate a final answer
                            const followUpResult = await chatSession.sendMessage([{
                                functionResponse: {
                                    name: call.name,
                                    response: toolResult
                                }
                            }]);
                            
                            text = followUpResult.response.text(); 
                        }
                    }

                    const finalReplyMatch = text.match(/<reply>([\s\S]*?)<\/reply>/i);
                    if (finalReplyMatch) {
                        text = finalReplyMatch[1].trim();
                    }

                    text += billingNote; // Append billing notification
                    logger.info({ response: text }, '🗣️ Life Guardian Replying');
                    
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
                    throw apiError;
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

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Life Worker Job Failed');
});
