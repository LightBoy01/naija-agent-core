import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SystemConfig } from '@naija-agent/types';
import { deductBalance } from '@naija-agent/firebase';
import { logger } from './utils/logger.js';
import { marketService } from './services/marketData.js';
import { lifeMemory } from './services/lifeMemory.js';
import { LIFE_TOOLS, executeLifeTool } from './tools.js';
import { whatsappService } from './services/whatsapp.js';

dotenv.config();


logger.info('🌱 [LIFE OS] Worker Starting... (Engine 2: Intelligence)');

// --- Billing Configuration ---
const TOOL_COSTS: Record<string, number> = {
    'get_market_prices': SystemConfig.COSTS.MARKET_PRICE_LOOKUP,
    'verify_nafdac': SystemConfig.COSTS.NAFDAC_VERIFICATION,
    'generate_quiz': 0, // Free (Loss Leader)
    // Add other tools here
};

// --- Redis Configuration for Life Engine (LOS) ---
const redisUrl = process.env.REDIS_URL_LOS || process.env.REDIS_URL; 
let redisConfig: any;

if (redisUrl) {
  try {
    const parsed = new URL(redisUrl);
    redisConfig = {
      host: parsed.hostname,
      port: parseInt(parsed.port),
      password: parsed.password,
      username: parsed.username,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 100, 3000)
    };
  } catch (e) {
    logger.error('❌ Failed to parse REDIS_URL_LOS, falling back to localhost');
    redisConfig = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
} else {
  logger.warn('⚠️ REDIS_URL_LOS not set. Using localhost default.');
  redisConfig = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
}

// --- AI Configuration ---
const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY;
if (!apiKey) {
  logger.warn('⚠️ GEMINI_API_KEY_LOS is missing. Using MOCK mode for testing.');
} else {
  logger.info('🔑 Gemini API Key found.');
}

const genAI = new GoogleGenerativeAI(apiKey || 'mock-key');

// Initialize Primary and Fallback Models
const primaryModel = genAI.getGenerativeModel({ 
  model: process.env.GEMINI_MODEL_LOS || SystemConfig.MODELS.AELIXXR_PRIMARY,
  tools: LIFE_TOOLS
});

const fallbackModel = genAI.getGenerativeModel({ 
  model: SystemConfig.MODELS.AELIXXR_FALLBACK,
  tools: LIFE_TOOLS
});

// --- Worker Setup ---
const worker = new Worker(
  'life-queue',
  async (job: Job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing Life Task');

    try {
        switch (job.name) {
            case 'market-scrape':
                logger.info('🛒 Scraping Market Prices...');
                const prices = await marketService.getPrices();
                logger.info({ count: prices.length }, '✅ Market Prices Retrieved');
                return { success: true, prices };
            
            case 'life-chat':
                const { userPhone, message, orgId } = job.data;
                logger.info({ userPhone, orgId }, '🧠 Thinking about Life...');

                if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === 'mock-key') {
                    logger.warn('⚠️ Using Mock Response due to missing/invalid API Key');
                    // Simulate Gemini deciding to call the tool
                    logger.info('🛠️ AI requested tools... (Simulated)');
                    const toolResult = await executeLifeTool('get_market_prices', {});
                    const mockReply = `(Mock AI) The current price of Rice is ₦${toolResult[0].price}.`;
                    return { success: true, reply: mockReply };
                }

                try {
                    // 1. Retrieve Long-Term Memory
                    const context = await lifeMemory.getContext(userPhone);
                    
                    // 2. Construct Prompt with Context
                    const systemPrompt = `
                    You are "Aelixxr", the Life Guardian and personal assistant for a Nigerian user.
                    
                    User Context:
                    - Family: ${JSON.stringify(context.family || {})}
                    - Goals: ${JSON.stringify(context.goals || [])}
                    - Preferences: ${JSON.stringify(context.preferences || {})}
                    
                    Your Goal: Provide actionable, empathetic, and hyper-relevant advice.
                    Use tools like 'get_market_prices' when the user asks about food costs.
                    
                    [BILLING AWARENESS]:
                    - Some actions cost money (e.g. verifying drugs).
                    - You do NOT need to ask for permission for small amounts (< ₦50).
                    - Just do it and helpful.
                    `;

                    // 3. Generate Content (Reasoning) with Fallback Strategy
                    let chatSession;
                    let result;
                    
                    const chatHistory = [
                        { role: 'user', parts: [{ text: systemPrompt }] },
                        { role: 'model', parts: [{ text: "I understand. I am ready to assist based on this context." }] }
                    ];

                    try {
                        chatSession = primaryModel.startChat({ history: chatHistory });
                        result = await chatSession.sendMessage(message);
                    } catch (primaryError: any) {
                        if (primaryError.message.includes('429') || primaryError.message.includes('503')) {
                            logger.warn('⚠️ Primary Life Model Failed. Switching to Fallback.');
                            chatSession = fallbackModel.startChat({ history: chatHistory });
                            result = await chatSession.sendMessage(message);
                        } else {
                            throw primaryError;
                        }
                    }

                    const response = result.response;
                    let text = response.text();

                    // 4. Tool Execution (Function Calling) with SMART BILLING
                    const functionCalls = response.functionCalls();
                    let billingNote = "";

                    if (functionCalls && functionCalls.length > 0) {
                        logger.info('🛠️ AI requested tools...');
                        for (const call of functionCalls) {
                            const cost = TOOL_COSTS[call.name] || 0;
                            
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
                                    text = `🚫 *Insufficient Balance.* \n\nOga, checking this costs ₦${cost/100}, but your Zynux wallet is low. Please top up to use premium Life features.`;
                                    break; // Stop execution
                                }
                                billingNote += `\n_(₦${cost/100} deducted for ${call.name})_`;
                            }

                            const toolResult = await executeLifeTool(call.name, call.args);
                            text += `\n\n[Tool Result: ${JSON.stringify(toolResult)}]`; 
                        }
                    }

                    text += billingNote; // Append billing notification
                    logger.info({ response: text }, '🗣️ Life Guardian Replying');
                    
                    // Send via WhatsApp
                    await whatsappService.sendText(userPhone, text);
                    
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
    connection: redisConfig, 
    concurrency: 5 
  }
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Life Worker Job Failed');
});
