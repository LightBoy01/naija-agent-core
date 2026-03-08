import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

console.log('🚀 [VERSION 1.0.2] Worker Service Starting...');
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from './services/whatsapp.js';
import { GoogleGenerativeAI, SchemaType, Tool } from '@google/generative-ai';
import { getProvider, PaymentProvider } from '@naija-agent/payments';
import { uploadMedia } from '@naija-agent/storage';
import { 
  getOrgById, 
  findOrCreateChat, 
  getChatHistory, 
  saveMessage, 
  deductBalance,
  checkTransaction,
  logTransaction,
  saveKnowledge,
  getAllKnowledge,
  Message
} from '@naija-agent/firebase';

dotenv.config();

// Ensure required environment variables are present
if (!process.env.WHATSAPP_API_TOKEN) {
  console.error('CRITICAL: WHATSAPP_API_TOKEN is not defined.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('CRITICAL: GEMINI_API_KEY is not defined.');
  process.exit(1);
}

// --- Payment Provider Setup ---
let paymentProvider: PaymentProvider | null = null;
if (process.env.PAYSTACK_SECRET_KEY) {
  console.log('💳 Payment Provider: Paystack Enabled');
  paymentProvider = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY);
} else {
  console.warn('⚠️ Payment Provider: Disabled (Missing PAYSTACK_SECRET_KEY)');
}

// --- Configuration ---
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

// Dedicated Redis client for rate limiting and other tasks
// [FORCE REDEPLOY] Triggering worker rebuild to ensure new ENV variables and firebase diagnostic updates are included.
const redisClient = new Redis(redisConfig);

const whatsappService = new WhatsAppService(
  process.env.WHATSAPP_API_TOKEN || '',
  process.env.WHATSAPP_PHONE_ID || ''
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

console.log('🚀 Worker Starting...');

const worker = new Worker<JobData>(
  'whatsapp-queue',
  async (job) => {
    const { from, content, type, orgId, messageId } = job.data;
    console.log(`Processing job ${job.id} for ${from} (${type})`);

    // --- Special Job: Outbound Template ---
    if (job.name === 'send-template') {
      if (!content.templateName) {
        throw new Error('Missing templateName for send-template job');
      }
      console.log(`Sending template '${content.templateName}' to ${from}`);
      await whatsappService.sendTemplate(from, content.templateName, content.languageCode || 'en_US');
      return { success: true };
    }

    // --- Validation: Ensure OrgId exists for message jobs ---
    if (!orgId) {
      console.error(`Job ${job.id} missing orgId.`);
      return { success: false, reason: 'Missing orgId' };
    }

    // --- 0. Rate Limiting (DoS Protection) ---
    const rateLimitKey = `rate_limit:${orgId}:${from}`;
    const requestCount = await redisClient.incr(rateLimitKey);
    
    if (requestCount === 1) {
      await redisClient.expire(rateLimitKey, 60);
    }

    if (requestCount > 10) {
      console.warn(`Rate limit exceeded for user ${from} in org ${orgId}`);
      if (requestCount === 11) {
        await whatsappService.sendText(from, "You're sending messages too fast. Please wait a minute.");
      }
      return { success: false, reason: 'Rate limited' };
    }

    try {
      // 1. Fetch Organization Config & System Prompt
      const org = await getOrgById(orgId);

      if (!org || !org.isActive) {
        console.error(`Organization ${orgId} not found or inactive.`);
        return { success: false, reason: 'Org inactive' };
      }

      const isAdmin = org.config?.adminPhone === from;
      console.log(`👤 Identity: ${isAdmin ? 'BOSS' : 'CUSTOMER'} (${from})`);

      // --- Per-Tenant Payment Provider Setup ---
      let tenantPaymentProvider: PaymentProvider | null = null;
      if (org.config?.payment) {
        tenantPaymentProvider = getProvider(org.config.payment.provider, org.config.payment.secretKey);
      } else if (process.env.PAYSTACK_SECRET_KEY) {
        tenantPaymentProvider = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY);
      }

      // --- Knowledge Base Fetching ---
      const businessKnowledge = await getAllKnowledge(orgId);
      const knowledgeContext = Object.entries(businessKnowledge)
        .map(([key, val]) => `- ${key}: ${val}`)
        .join('\n');

      // --- Identity-Based System Prompt ---
      let systemPrompt = "";
      if (isAdmin) {
        systemPrompt = `You are the Business Manager for ${org.name}. You are talking to your BOSS. 
        Be professional, helpful, and efficient. 
        Your primary job is to help the Boss manage the business.
        Use 'save_knowledge' to store new facts, prices, or policies the Boss tells you.
        Current Knowledge Base:\n${knowledgeContext || 'Empty'}`;
      } else {
        systemPrompt = org.systemPrompt || "You are a helpful sales assistant.";
        systemPrompt += `\n\n[BUSINESS KNOWLEDGE]: Use these facts for the customer:\n${knowledgeContext || 'No specific facts yet.'}`;
        
        systemPrompt += `\n\n[AI JUDGMENT & WISDOM]: 
        1. PROTECT THE BUSINESS: If a customer asks for a discount you don't have authority for, or wants a 'Bulk Order', do not say 'No'. Instead, use 'escalate_to_boss' to ping the owner.
        2. BE PROACTIVE: If the situation is complex or the customer is angry, escalate immediately.
        3. SALES FIRST: Your goal is to close the deal. If you're unsure of a price, escalate rather than giving wrong info.`;

        if (tenantPaymentProvider) {
          systemPrompt += `\n\n[PAYMENT]: Use 'verify_transaction' for receipts. If verified, confirm the order.`;
        }
      }

      // --- Identity-Based Tools ---
      const tenantTools: Tool[] = [];

      // Tool: Verify Transaction (Available to everyone if provider exists)
      if (tenantPaymentProvider) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "verify_transaction",
              description: "Verifies a bank transaction reference and amount.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  reference: { type: SchemaType.STRING, description: "Reference code" },
                  amount: { type: SchemaType.NUMBER, description: "Amount in Naira" }
                },
                required: ["reference", "amount"]
              } as any
            }
          ]
        });
      }

      // Tool: Save Knowledge (BOSS ONLY)
      if (isAdmin) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "save_knowledge",
              description: "Saves a business fact, price, policy, or product (including images).",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  key: { type: SchemaType.STRING, description: "Descriptive name (e.g., iPhone_15_Blue)" },
                  content: { type: SchemaType.STRING, description: "The details or price." },
                  imageUrl: { type: SchemaType.STRING, description: "Optional URL of the product image." }
                },
                required: ["key", "content"]
              } as any
            }
          ]
        });
      }

      // Tool: Escalate to Boss (Available to AI in Sales Mode)
      if (!isAdmin && org.config?.adminPhone) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "escalate_to_boss",
              description: "Pings the business owner for assistance with a specific customer. Use this for high-value deals, complex issues, or discount requests.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  reason: { type: SchemaType.STRING, description: "Why you are calling the Boss." }
                },
                required: ["reason"]
              } as any
            }
          ]
        });
      }

      const tenantModelName = org.config?.model || "gemini-2.5-flash";
      const model = genAI.getGenerativeModel({ 
        model: tenantModelName,
        tools: tenantTools.length > 0 ? tenantTools : undefined
      });

      // 1.5 Balance Check (Boss is free)
      const balance = org.balance || 0;
      let costPerReply = isAdmin ? 0 : (org.costPerReply || 2000);
      
      if (!isAdmin && type === 'image') {
          costPerReply = org.costPerImage || Math.floor(costPerReply * 2.5); 
      }

      if (!isAdmin && balance < costPerReply) {
        console.warn(`Org ${org.name} (${orgId}) has insufficient balance: ${balance} < ${costPerReply}`);
        await whatsappService.sendText(from, "Service suspended: Insufficient balance.");
        return { success: true, reason: 'Insufficient balance' };
      }

      // 2. Manage Chat Session (Find or Create)
      const chatId = await findOrCreateChat(orgId, from, job.data.name || 'User');

      // 3. Fetch Conversation History (Last 10 messages)
      const history = await getChatHistory(chatId, 10);
      
      const historyContext = history.map((msg: Message) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      // 4. Prepare New Message Input
      const promptParts: any[] = [];
      let userMessageContent = "";
      let permanentUrl: string | undefined = undefined;

      if (type === 'text' && content.text) {
        userMessageContent = content.text;
        promptParts.push(content.text);
      } else if (type === 'audio' && content.audioId) {
        const { buffer, mimeType } = await whatsappService.downloadMedia(content.audioId);
        
        // --- Persistence: Save to Firebase Storage ---
        try {
          permanentUrl = await uploadMedia(orgId, `audio_${messageId || Date.now()}.mp3`, buffer, mimeType, { from, type: 'audio' });
          console.log(`✅ Audio archived: ${permanentUrl}`);
        } catch (e) {
          console.warn('❌ Media upload failed (Audio):', e);
        }

        userMessageContent = "[AUDIO MESSAGE]";
        promptParts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: mimeType,
          },
        });
        promptParts.push("The user sent a voice note. Please reply in text.");
      } else if (type === 'image' && content.imageId) {
        const { buffer, mimeType } = await whatsappService.downloadMedia(content.imageId);
        
        // --- Persistence: Save to Firebase Storage ---
        try {
          permanentUrl = await uploadMedia(orgId, `img_${messageId || Date.now()}.jpg`, buffer, mimeType, { from, type: 'image' });
          console.log(`✅ Image archived: ${permanentUrl}`);
        } catch (e) {
          console.warn('❌ Media upload failed (Image):', e);
        }

        userMessageContent = content.caption ? `[IMAGE] ${content.caption}` : "[IMAGE]";
        promptParts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: mimeType,
          },
        });
        promptParts.push(content.caption 
          ? `The user sent an image with the caption: "${content.caption}". Analyze it. If it's a receipt, verify it.`
          : "The user sent an image. Analyze it. If it's a receipt, verify it.");
      }

      // 5. Call Gemini
      const chatSession = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: `System Instruction: ${systemPrompt}\n\n[CONTEXT] Current Business Credit Balance: ${balance} kobo (Note: 100 kobo = 1 Naira).` }],
          },
          {
            role: "model",
            parts: [{ text: "Understood. I am ready to assist." }],
          },
          ...historyContext,
        ],
      });

      let result = await chatSession.sendMessage(promptParts);
      let responseText = result.response.text();
      
      const functionCalls = result.response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        const functionResponses = [];
        for (const call of functionCalls) {
          if (call.name === 'verify_transaction') {
            const args = call.args as any;
            let toolResult;
            const existingTx = await checkTransaction(orgId, args.reference);
            if (existingTx) {
               toolResult = { status: 'failed', reason: 'DUPLICATE_RECEIPT' };
            } else if (tenantPaymentProvider) {
                const tx = await tenantPaymentProvider.verify(args.reference, args.amount);
                if (tx && tx.status === 'success') {
                    await logTransaction(orgId, args.reference, tx);
                    toolResult = { status: 'verified', data: tx };
                } else {
                    toolResult = { status: 'failed', reason: 'INVALID_TRANSACTION' };
                }
            } else {
                toolResult = { status: 'error', reason: 'NO_PROVIDER' };
            }
            functionResponses.push({ functionResponse: { name: 'verify_transaction', response: toolResult } });
          } else if (call.name === 'save_knowledge' && isAdmin) {
            const args = call.args as any;
            console.log(`🧠 Saving Knowledge: ${args.key} = ${args.content} (Image: ${args.imageUrl || 'None'})`);
            try {
              await saveKnowledge(orgId, args.key, args.content, args.imageUrl);
              functionResponses.push({
                functionResponse: {
                  name: 'save_knowledge',
                  response: { status: 'success', message: `Knowledge '${args.key}' has been updated.` }
                }
              });
            } catch (e: any) {
              functionResponses.push({
                functionResponse: {
                  name: 'save_knowledge',
                  response: { status: 'error', message: e.message }
                }
              });
            }
          } else if (call.name === 'escalate_to_boss' && !isAdmin && org.config?.adminPhone) {
            const args = call.args as any;
            console.log(`📣 ESCALATION: ${args.reason}`);
            try {
              const customerName = job.data.name || 'Unknown';
              const alertMessage = `📣 [ESCALATION NEEDED]\nOga, I need help with Customer *${customerName}* (${from}).\nReason: ${args.reason}`;
              await whatsappService.sendText(org.config.adminPhone, alertMessage);
              
              functionResponses.push({
                functionResponse: {
                  name: 'escalate_to_boss',
                  response: { status: 'success', message: "I've informed the Boss. They will get back to you soon if necessary. How else can I help while we wait?" }
                }
              });
            } catch (e: any) {
              functionResponses.push({
                functionResponse: {
                  name: 'escalate_to_boss',
                  response: { status: 'error', message: e.message }
                }
              });
            }
          }
        }
        if (functionResponses.length > 0) {
           result = await chatSession.sendMessage(functionResponses);
           responseText = result.response.text();
        }
      }
      
      // 6. Send Reply
      await whatsappService.sendText(from, responseText);

      // 7. Persist & Deduct
      await saveMessage(chatId, { 
        role: 'user', 
        content: userMessageContent, 
        type: type as any, 
        metadata: { messageId, permanentUrl } 
      });
      await saveMessage(chatId, { role: 'assistant', content: responseText, type: 'text' });

      const newBalance = await deductBalance(orgId, costPerReply);
      if (newBalance !== null && newBalance <= 1000) {
         const alertKey = `alert:low_balance:${orgId}`;
         const hasAlerted = await redisClient.get(alertKey);
         if (!hasAlerted) {
           console.warn(`⚠️ Low Balance Alert for ${orgId}`);
           await redisClient.setex(alertKey, 86400, '1');
         }
      }

    } catch (error: any) {
      console.error(`Job ${job.id} failed attempt ${job.attemptsMade + 1}/${job.opts.attempts}:`, error.message);
      
      // If we still have retries left, rethrow to let BullMQ handle backoff
      if (job.attemptsMade < (job.opts.attempts || 3)) {
        throw error;
      }

      // Final Failure: Send Fallback Message
      console.error(`Job ${job.id} permanently failed. Sending fallback.`);
      await whatsappService.sendText(from, "I'm having trouble connecting right now. Please try again later.");
      
      // We don't rethrow here so the job is marked as 'failed' but handled gracefully
    }

    return { success: true };
  },
  { connection: redisConfig } // Use config object directly
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} finished successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed: ${err.message}`);
});
