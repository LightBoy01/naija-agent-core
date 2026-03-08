import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

console.log('🚀 [VERSION 1.0.2] Worker Service Starting...');
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from './services/whatsapp.js';
import { GoogleGenerativeAI, SchemaType, Tool } from '@google/generative-ai';
import { getProvider, PaymentProvider } from '@naija-agent/payments';
import { 
  getOrgById, 
  findOrCreateChat, 
  getChatHistory, 
  saveMessage, 
  deductBalance,
  checkTransaction,
  logTransaction,
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

      // --- Per-Tenant Payment Provider Setup ---
      let tenantPaymentProvider: PaymentProvider | null = null;
      if (org.config?.payment) {
        console.log(`💳 Tenant Payment: ${org.config.payment.provider} Enabled for ${org.name}`);
        tenantPaymentProvider = getProvider(org.config.payment.provider, org.config.payment.secretKey);
      } else if (process.env.PAYSTACK_SECRET_KEY) {
        console.log(`💳 Global Payment: Paystack Enabled (Fallback) for ${org.name}`);
        tenantPaymentProvider = getProvider('paystack', process.env.PAYSTACK_SECRET_KEY);
      }

      let systemPrompt = org.systemPrompt || "You are a helpful assistant.";
      
      // Update System Prompt for Hybrid Verification
      if (tenantPaymentProvider) {
        systemPrompt += `\n\n[PAYMENT VERIFICATION]: You have access to a 'verify_transaction' tool. If the user sends a receipt image, extract the Reference Code and Amount, and call this tool to verify it. Do not verify visually if you can use the tool.`;
      } else {
        systemPrompt += `\n\n[PAYMENT VERIFICATION]: You DO NOT have access to bank APIs. If the user sends a receipt, perform a VISUAL ANALYSIS (Check Date, Time, Amount, Font Consistency). Warn the user: "I can only check the image visually, not the bank account. Please confirm the alert manually."`;
      }

      // --- Per-Tenant Model & Tools Setup ---
      const tenantTools: Tool[] = tenantPaymentProvider ? [
        {
          functionDeclarations: [
            {
              name: "verify_transaction",
              description: "Verifies a bank transaction using its reference code and amount. Use this when a user sends a receipt.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  reference: { type: SchemaType.STRING, description: "The transaction reference code from the receipt." },
                  amount: { type: SchemaType.NUMBER, description: "The expected amount in Naira." }
                },
                required: ["reference", "amount"]
              } as any
            }
          ]
        }
      ] : [];

      const tenantModelName = org.config?.model || "gemini-2.5-flash";
      const model = genAI.getGenerativeModel({ 
        model: tenantModelName,
        tools: tenantTools
      });

      // 1.5 Balance Check
      const balance = org.balance || 0;
      let costPerReply = org.costPerReply || 2000;
      
      if (type === 'image') {
          costPerReply = org.costPerImage || Math.floor(costPerReply * 2.5); 
      }

      if (balance < costPerReply) {
        console.warn(`Org ${org.name} (${orgId}) has insufficient balance: ${balance} < ${costPerReply}`);
        await whatsappService.sendText(from, "Service suspended: Insufficient balance. Please contact the business owner.");
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

      if (type === 'text' && content.text) {
        userMessageContent = content.text;
        promptParts.push(content.text);
      } else if (type === 'audio' && content.audioId) {
        const { buffer, mimeType } = await whatsappService.downloadMedia(content.audioId);
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
      await saveMessage(chatId, { role: 'user', content: userMessageContent, type: type as any, metadata: { messageId } });
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
