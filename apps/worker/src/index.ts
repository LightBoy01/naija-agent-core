import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

console.log('🚀 [VERSION 1.0.2] Worker Service Starting...');
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from './services/whatsapp.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  getOrgById, 
  findOrCreateChat, 
  getChatHistory, 
  saveMessage, 
  deductBalance,
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

// --- Configuration ---
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

// Dedicated Redis client for rate limiting and other tasks
const redisClient = new Redis(redisConfig);

const whatsappService = new WhatsAppService(
  process.env.WHATSAPP_API_TOKEN || '',
  process.env.WHATSAPP_PHONE_ID || ''
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

    // --- 0. Rate Limiting (DoS Protection) ---
    // Key: rate_limit:{orgId}:{userPhone}
    const rateLimitKey = `rate_limit:${orgId}:${from}`;
    const requestCount = await redisClient.incr(rateLimitKey); // Use dedicated redis client
    
    if (requestCount === 1) {
      await redisClient.expire(rateLimitKey, 60); // 1 minute window
    }

    if (requestCount > 10) {
      console.warn(`Rate limit exceeded for user ${from} in org ${orgId}`);
      // Optional: Send a "Cool down" message only once
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

      const systemPrompt = org.systemPrompt || "You are a helpful assistant.";

      // 1.5 Balance Check (The "No Pay, No Chat" Rule)
      const balance = org.balance || 0;
      const costPerReply = org.costPerReply || 0; // Default 2000 kobo (20.00)

      if (balance < costPerReply) {
        console.warn(`Org ${org.name} (${orgId}) has insufficient balance: ${balance} < ${costPerReply}`);
        // Send concise "Service Suspended" message
        await whatsappService.sendText(from, "Service suspended: Insufficient balance. Please contact the business owner.");
        return { success: true, reason: 'Insufficient balance' };
      }

      // 2. Manage Chat Session (Find or Create)
      const chatId = await findOrCreateChat(orgId, from, job.data.name || 'User');
      console.log(`Chat Session: ${chatId}`);

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
        console.log(`Downloading audio ${content.audioId}...`);
        const { buffer, mimeType } = await whatsappService.downloadMedia(content.audioId);
        
        userMessageContent = "[AUDIO MESSAGE]";
        promptParts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: mimeType,
          },
        });
        promptParts.push("The user sent a voice note. Please reply in text.");
      }

      // 5. Call Gemini with Context
      console.log(`Calling Gemini for Org: ${org.name}...`);
      
      const chatSession = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: `System Instruction: ${systemPrompt}` }],
          },
          {
            role: "model",
            parts: [{ text: "Understood. I am ready to assist." }],
          },
          ...historyContext,
        ],
      });

      const result = await chatSession.sendMessage(promptParts);
      const responseText = result.response.text();
      console.log(`Gemini Reply: ${responseText}`);

      // 6. Send Reply to WhatsApp
      await whatsappService.sendText(from, responseText);

      // 7. Persist Interaction & Deduct Balance
      // Save User Message
      await saveMessage(chatId, {
        role: 'user',
        content: userMessageContent,
        type: type as any,
        metadata: { messageId },
      });

      // Save Assistant Message
      await saveMessage(chatId, {
        role: 'assistant',
        content: responseText,
        type: 'text',
      });

      // Deduct Balance (Atomic Transaction)
      const newBalance = await deductBalance(orgId, costPerReply);
      if (newBalance === null) {
        console.error(`Failed to deduct balance for org ${orgId}`);
      } else {
        console.log(`Remaining Balance for ${orgId}: ${newBalance}`);

        // --- Low Balance Alert ---
        const LOW_BALANCE_THRESHOLD = 1000; // 10.00 NGN (in kobo)
        if (newBalance <= LOW_BALANCE_THRESHOLD) {
           const alertKey = `alert:low_balance:${orgId}`;
           const hasAlerted = await redisClient.get(alertKey);

           if (!hasAlerted) {
             console.warn(`⚠️ Low Balance Alert for ${orgId} (${newBalance})`);
             // TODO: In a real multi-tenant system, we would look up the admin's phone number.
             // For now, we assume the 'from' user is the owner if they are testing, 
             // OR we just log it. 
             // Ideally, we queue a 'send-template' job to the specific admin phone number.
             
             // Example: queue job to admin (if we had admin phone stored)
             // const adminPhone = org.adminPhone;
             // if (adminPhone) {
             //   await whatsappService.sendTemplate(adminPhone, 'low_balance_alert');
             // }
             
             // Set cooldown for 24 hours (86400 seconds)
             await redisClient.setex(alertKey, 86400, '1');
           }
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
