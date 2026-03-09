import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';

console.log('🚀 [VERSION 1.0.3] Worker Service Starting... (Free Tier Pivot)');
import { JobData } from '@naija-agent/types';
import { WhatsAppService } from './services/whatsapp.js';
import { GoogleGenerativeAI, SchemaType, Tool } from '@google/generative-ai';
import { getProvider, PaymentProvider } from '@naija-agent/payments';
// import { uploadMedia } from '@naija-agent/storage'; // FREE TIER PIVOT: Disabled to save cost
import { 
  getOrgById, 
  getOrgByPhoneId,
  findOrCreateChat, 
  getChatHistory, 
  saveMessage, 
  deductBalance,
  addBalance,
  checkTransaction,
  logTransaction,
  logPendingTransaction,
  saveKnowledge,
  getAllKnowledge,
  deleteKnowledge,
  updateActivity,
  verifyAdminSession,
  verifyAdminPin,
  setAdminAuth,
  createTenant,
  getNetworkStats,
  setMfaCode,
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
    const { from, content, type, orgId, messageId, phoneId } = job.data;
    console.log(`Processing job ${job.id} for ${from} (${type})`);

    // Variables needed in catch block for refund logic
    let isAdmin = false;
    let costPerReply = 0;
    let deductionDone = false;
    let tenantWhatsAppService = whatsappService;

    // --- Special Job: Outbound Template ---
    if (job.name === 'send-template') {
      if (!content.templateName) {
        throw new Error('Missing templateName for send-template job');
      }

      // Dynamic token lookup for multi-tenant outbound
      if (phoneId) {
        const org = await getOrgByPhoneId(phoneId);
        if (org?.config?.whatsappToken) {
          tenantWhatsAppService = new WhatsAppService(org.config.whatsappToken, phoneId);
        }
      }

      console.log(`Sending template '${content.templateName}' to ${from} using phoneId ${phoneId}`);
      await tenantWhatsAppService.sendTemplate(from, content.templateName, content.languageCode || 'en_US');
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

    try {
      // 1. Fetch Organization Config & System Prompt
      const org = await getOrgById(orgId);

      if (!org || !org.isActive) {
        console.error(`Organization ${orgId} not found or inactive.`);
        return { success: false, reason: 'Org inactive' };
      }

      isAdmin = org.config?.adminPhone === from;
      console.log(`👤 Identity: ${isAdmin ? 'BOSS' : 'CUSTOMER'} (${from})`);

      // --- Per-Tenant WhatsApp Service (Multi-Tenancy) ---
      if (org.config?.whatsappToken) {
        tenantWhatsAppService = new WhatsAppService(
          org.config.whatsappToken,
          org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || ''
        );
      }

      if (requestCount > 10) {
        console.warn(`Rate limit exceeded for user ${from} in org ${orgId}`);
        if (requestCount === 11) {
          await tenantWhatsAppService.sendText(from, "You're sending messages too fast. Please wait a minute.");
        }
        return { success: false, reason: 'Rate limited' };
      }

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
        const isAuth = await verifyAdminSession(orgId, from);
        
        systemPrompt = `You are the Business Manager for ${org.name}. You are talking to your BOSS.
        Your primary job is to help the Boss manage business facts, prices, and activities (Bookings/Deliveries).
        
        [SECURITY]:
        Status: ${isAuth ? 'AUTHENTICATED' : 'LOCKED'}.
        If Status is LOCKED, you MUST ask the Boss for their 4-digit PIN before you can use 'save_knowledge', 'delete_knowledge', or 'manage_activity'.
        If the Boss provides the PIN, use 'verify_admin_pin' to unlock.

        [ADMIN TOOLS]:
        - Use 'save_knowledge' to update prices/policies.
        - Use 'delete_knowledge' to remove old info.
        - Use 'manage_activity' to create Waybills (Logistics) or Bookings (Appointments).
        
        Current Knowledge:\n${knowledgeContext || 'Empty'}`;
      } else {
        systemPrompt = org.systemPrompt || "You are a helpful sales assistant.";
        systemPrompt += `\n\n[BUSINESS KNOWLEDGE]: Use these facts for the customer:\n${knowledgeContext || 'No specific facts yet.'}`;
        
        systemPrompt += `\n\n[AI JUDGMENT & WISDOM]: 
        1. SECTOR FLEXIBILITY: If the business is Logistics, handle Waybill requests. If it's Service-based, handle Appointment Bookings.
        2. ESCALATION: Use 'escalate_to_boss' for high-value deals or complex issues.
        3. ACCURACY: Use the provided Knowledge Base strictly. If unsure, escalate.`;

        if (tenantPaymentProvider) {
          systemPrompt += `\n\n[PAYMENT]: Use 'verify_transaction' for receipts.`;
        }
      }

      // --- Identity-Based Tools ---
      const tenantTools: Tool[] = [];

      // 1. Transaction Verification (All users)
      if (tenantPaymentProvider) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "verify_transaction",
              description: "Verifies a bank transaction with the payment provider.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  reference: { type: SchemaType.STRING, description: "Transaction Reference or Session ID" },
                  amount: { type: SchemaType.NUMBER, description: "Amount in Naira" },
                  bankName: { type: SchemaType.STRING, description: "Name of the sending bank" },
                  date: { type: SchemaType.STRING, description: "Transaction date/time" }
                },
                required: ["reference", "amount"]
              } as any
            }
          ]
        });
      }

      // 2. Admin Tools (BOSS ONLY)
      if (isAdmin) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "verify_admin_pin",
              description: "Verifies the 4-digit PIN provided by the Boss to unlock management tools.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { pin: { type: SchemaType.STRING, description: "The 4-digit PIN." } },
                required: ["pin"]
              } as any
            },
            {
              name: "save_knowledge",
              description: "Updates business facts, prices, or product images. (Requires Authentication)",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  key: { type: SchemaType.STRING, description: "Key name" },
                  content: { type: SchemaType.STRING, description: "Details/Price" },
                  imageUrl: { type: SchemaType.STRING, description: "Product Image URL" }
                },
                required: ["key", "content"]
              } as any
            },
            {
              name: "delete_knowledge",
              description: "Deletes obsolete business knowledge. (Requires Authentication)",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { key: { type: SchemaType.STRING, description: "Key to delete" } },
                required: ["key"]
              } as any
            },
            {
              name: "manage_activity",
              description: "Creates or updates a business activity. (Requires Authentication)",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  id: { type: SchemaType.STRING, description: "Unique ID (e.g., Waybill number, Reference, or Date_Time)" },
                  type: { type: SchemaType.STRING, description: "Category of activity (e.g. 'order', 'booking', 'lawsuit', 'donation', etc.)" },
                  summary: { type: SchemaType.STRING, description: "Full details of the activity" }
                },
                required: ["id", "type", "summary"]
              } as any
            }
          ]
        });
      }

      // 3. Escalation Tool (Customers only)
      if (!isAdmin && org.config?.adminPhone) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "escalate_to_boss",
              description: "Pings the business owner for assistance with a specific customer.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: { reason: { type: SchemaType.STRING, description: "Reason for escalation" } },
                required: ["reason"]
              } as any
            }
          ]
        });
      }

      // 4. MASTER POWERS (Sovereign only)
      if (isAdmin && org.config?.isMaster) {
        tenantTools.push({
          functionDeclarations: [
            {
              name: "create_tenant",
              description: "Onboards a new client business. (Requires Authentication)",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  id: { type: SchemaType.STRING, description: "Unique slug (e.g. bims_gadgets)" },
                  name: { type: SchemaType.STRING, description: "Display name" },
                  adminPhone: { type: SchemaType.STRING, description: "The client boss phone (234...)" },
                  phoneId: { type: SchemaType.STRING, description: "Their WhatsApp Phone ID" },
                  wabaId: { type: SchemaType.STRING, description: "Optional: Their WhatsApp Business Account ID (for auto-subscription)" },
                  prompt: { type: SchemaType.STRING, description: "Their AI personality" }
                },
                required: ["id", "name", "adminPhone", "phoneId", "prompt"]
              } as any
            },
            {
              name: "get_network_stats",
              description: "Retrieves network-wide stats like total clients and total revenue. (Requires Authentication)",
              parameters: { type: SchemaType.OBJECT, properties: {} }
            },
            {
              name: "generate_login_code",
              description: "Generates a 6-digit MFA code for the Sovereign to log into the web dashboard. (Requires Authentication)",
              parameters: { type: SchemaType.OBJECT, properties: {} }
            }
          ]
        });
      }

      const tenantModelName = org.config?.model || "gemini-2.5-flash";
      const model = genAI.getGenerativeModel({ 
        model: tenantModelName,
        tools: tenantTools.length > 0 ? tenantTools : undefined
      });

      // 1.5 Balance Check & Deduction (PRE-DEBIT to prevent race conditions)
      const balance = org.balance || 0;
      costPerReply = isAdmin ? 0 : (org.costPerReply || 2000);
      
      if (!isAdmin && type === 'image') {
          costPerReply = org.costPerImage || Math.floor(costPerReply * 2.5); 
      }

      if (!isAdmin && balance < costPerReply) {
        console.warn(`Org ${org.name} (${orgId}) has insufficient balance: ${balance} < ${costPerReply}`);
        await tenantWhatsAppService.sendText(from, "Service suspended: Insufficient balance.");
        return { success: true, reason: 'Insufficient balance' };
      }

      // Deduct balance early
      let newBalance = balance;
      if (!isAdmin) {
        const resultBalance = await deductBalance(orgId, costPerReply);
        if (resultBalance === null) {
          console.error(`❌ Balance deduction failed for ${orgId}. Aborting.`);
          await tenantWhatsAppService.sendText(from, "Service temporarily unavailable. Please try again later.");
          return { success: false, reason: 'Balance deduction failed' };
        }
        newBalance = resultBalance;
        deductionDone = true;
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
      let mediaId: string | undefined = undefined; // FREE TIER PIVOT: Store ID instead of URL

      if (type === 'text' && content.text) {
        userMessageContent = content.text;
        promptParts.push(content.text);
      } else if (type === 'audio' && content.audioId) {
        const { buffer, mimeType } = await tenantWhatsAppService.downloadMedia(content.audioId);
        
        // --- Persistence: FREE TIER PIVOT (No Upload) ---
        // mediaTask = uploadMedia(...) // DISABLED
        mediaId = content.audioId;

        userMessageContent = "[AUDIO MESSAGE]";
        promptParts.push({ inlineData: { data: buffer.toString('base64'), mimeType } });
        promptParts.push("The user sent a voice note. Please reply in text.");

      } else if (type === 'image' && content.imageId) {
        const { buffer, mimeType } = await tenantWhatsAppService.downloadMedia(content.imageId);
        
        // --- Persistence: FREE TIER PIVOT (No Upload) ---
        // mediaTask = uploadMedia(...) // DISABLED
        mediaId = content.imageId;

        userMessageContent = content.caption ? `[IMAGE] ${content.caption}` : "[IMAGE]";
        promptParts.push({ inlineData: { data: buffer.toString('base64'), mimeType } });
        
        // --- Enhanced Vision Prompt (Anti-Fraud) ---
        const visionInstruction = `
        The user sent an image. ANALYZE it as a financial receipt or bank alert.
        
        [ANTI-FRAUD PROTOCOL]:
        1. CHECK FOR EDITS: Look for font mismatches (different sizes/styles), text misalignment, or "boxy" artifacts around numbers.
        2. DATA EXTRACTION: Extract the Reference/Session ID, Amount, Bank Name, and Date.
        3. FAKE DETECTION: If the reference looks suspicious (e.g. "1234567890" or "TEST_PAYMENT"), flag it.
        
        If it's a receipt:
        - Use 'verify_transaction' to check the reference against the bank system.
        - If you detect any sign of editing or Photoshop, report it as 'SUSPICIOUS' in your reply.
        
        Caption: "${content.caption || 'None'}"
        `;
        promptParts.push(visionInstruction);
      }

      // 5. Call Gemini
      const isAuth = isAdmin ? await verifyAdminSession(orgId, from) : false;

      const chatSession = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: `System Instruction: ${systemPrompt}\n\n[CONTEXT] Current Business Credit Balance: ${balance} kobo (Note: 100 kobo = 1 Naira).\nAdmin Auth Status: ${isAuth ? 'AUTHENTICATED' : 'LOCKED'}` }],
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
          const args = call.args as any;

          if (call.name === 'verify_transaction') {
            let toolResult;
            const existingTx = await checkTransaction(orgId, args.reference);
            
            if (existingTx) {
               if (existingTx.status === 'success') {
                  toolResult = { status: 'verified', reason: 'ALREADY_VERIFIED', data: existingTx };
               } else if (existingTx.status === 'pending') {
                  toolResult = { status: 'pending', reason: 'AWAITING_BANK_SIGNAL', message: "I've already recorded this transfer. We are just waiting for the bank to send us a confirmation signal. I will notify you once it arrives!" };
               } else {
                  toolResult = { status: 'failed', reason: 'DUPLICATE_RECEIPT' };
               }
            } else if (tenantPaymentProvider) {
                const tx = await tenantPaymentProvider.verify(args.reference, args.amount);
                if (tx && tx.status === 'success') {
                    await logTransaction(orgId, args.reference, { 
                      ...tx, 
                      extractedBank: args.bankName, 
                      extractedDate: args.date 
                    });
                    toolResult = { status: 'verified', data: tx };
                } else if (org.config?.useSmsBridge) {
                    // --- Auto-Matching Engine (High Security) ---
                    console.log(`⏳ [PENDING] API verification failed for ${args.reference}. Logging as PENDING for SMS Bridge.`);
                    await logPendingTransaction(orgId, from, args.amount, args.reference);
                    toolResult = { status: 'pending', reason: 'AWAITING_SMS_BRIDGE', message: "I've recorded your transfer. We are just waiting for the bank to send us a confirmation signal. I will notify you once it arrives!" };
                } else {
                    // --- Graceful Fallback (Vision Only) ---
                    console.log(`👁️ [VISION] No bridge/API. Logging ${args.reference} as Vision Verified.`);
                    await logTransaction(orgId, args.reference, {
                      status: 'vision_verified',
                      amount: args.amount,
                      extractedBank: args.bankName,
                      extractedDate: args.date,
                      note: 'Verified by AI Vision only (No SMS/API verification)'
                    });
                    toolResult = { status: 'verified', reason: 'VISION_VERIFIED', message: "I've verified your receipt using my vision system. Please note that final confirmation depends on the bank alert." };
                }
            } else if (org.config?.useSmsBridge) {
                // No provider but bridge is ON
                await logPendingTransaction(orgId, from, args.amount, args.reference);
                toolResult = { status: 'pending', reason: 'NO_PROVIDER_LOGGED_FOR_SMS', message: "Transfer logged. I am now waiting for the bank confirmation to arrive. I will message you instantly when I see it!" };
            } else {
                // No provider and bridge is OFF - Extreme Fallback
                await logTransaction(orgId, args.reference, {
                  status: 'vision_verified',
                  amount: args.amount,
                  note: 'Manual fallback verification'
                });
                toolResult = { status: 'verified', reason: 'MANUAL_VISION_VERIFIED', message: "Transfer recorded. Thank you!" };
            }
            functionResponses.push({ functionResponse: { name: 'verify_transaction', response: toolResult } });

          } else if (call.name === 'verify_admin_pin' && isAdmin) {
            console.log(`🔐 Admin PIN verification attempt for ${orgId}`);
            
            // --- Lockout Logic (Brute Force Protection) ---
            const lockoutKey = `lockout:admin_pin:${orgId}:${from}`;
            const attempts = await redisClient.get(lockoutKey);
            
            if (attempts && parseInt(attempts) >= 3) {
              functionResponses.push({ functionResponse: { name: 'verify_admin_pin', response: { status: 'error', message: 'Too many incorrect attempts. You are locked out for 15 minutes.' } } });
              continue;
            }

            const isCorrect = await verifyAdminPin(orgId, args.pin);
            if (isCorrect) {
              await redisClient.del(lockoutKey); // Reset on success
              await setAdminAuth(orgId, from);
              functionResponses.push({ functionResponse: { name: 'verify_admin_pin', response: { status: 'success', message: 'PIN Verified. Management tools are now UNLOCKED for 2 hours.' } } });
            } else {
              const newAttempts = await redisClient.incr(lockoutKey);
              if (newAttempts === 1) await redisClient.expire(lockoutKey, 900); // 15 min
              
              const remaining = 3 - newAttempts;
              functionResponses.push({ functionResponse: { name: 'verify_admin_pin', response: { status: 'error', message: `Incorrect PIN. Access denied. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Locked out.'}` } } });
            }

          } else if (['save_knowledge', 'delete_knowledge', 'manage_activity', 'create_tenant', 'get_network_stats'].includes(call.name) && isAdmin) {
            if (!isAuth) {
              functionResponses.push({ functionResponse: { name: call.name, response: { status: 'error', message: 'SECURITY_LOCKED: You must verify your PIN before doing this.' } } });
              continue;
            }

            try {
              if (call.name === 'save_knowledge') {
                await saveKnowledge(orgId, args.key, args.content, args.imageUrl);
                functionResponses.push({ functionResponse: { name: 'save_knowledge', response: { status: 'success', message: `Knowledge '${args.key}' updated.` } } });
              } else if (call.name === 'delete_knowledge') {
                await deleteKnowledge(orgId, args.key);
                functionResponses.push({ functionResponse: { name: 'delete_knowledge', response: { status: 'success', message: `Knowledge '${args.key}' removed.` } } });
              } else if (call.name === 'manage_activity') {
                await updateActivity(orgId, args.id, args.type, { summary: args.summary });
                functionResponses.push({ functionResponse: { name: 'manage_activity', response: { status: 'success', message: `${args.type} '${args.id}' has been recorded.` } } });
              } else if (call.name === 'create_tenant' && org.config?.isMaster) {
                await createTenant({
                  id: args.id,
                  name: args.name,
                  whatsappPhoneId: args.phoneId,
                  adminPhone: args.adminPhone,
                  systemPrompt: args.prompt
                });
                
                let subMsg = "";
                if (args.wabaId) {
                   const subscribed = await whatsappService.subscribeWaba(args.wabaId);
                   subMsg = subscribed ? " (WABA Subscribed ✅)" : " (WABA Subscription Failed ❌)";
                }

                functionResponses.push({ functionResponse: { name: 'create_tenant', response: { status: 'success', message: `Tenant '${args.name}' created successfully.${subMsg}` } } });
              } else if (call.name === 'get_network_stats' && org.config?.isMaster) {
                const stats = await getNetworkStats();
                functionResponses.push({ functionResponse: { name: 'get_network_stats', response: { status: 'success', data: stats } } });
              } else if (call.name === 'generate_login_code' && org.config?.isMaster) {
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                await setMfaCode(orgId, code);
                functionResponses.push({ functionResponse: { name: 'generate_login_code', response: { status: 'success', code, message: 'Code generated. Share this with the Boss. It expires in 5 minutes.' } } });
              }
            } catch (e: any) {
              functionResponses.push({ functionResponse: { name: call.name, response: { status: 'error', message: e.message } } });
            }

          } else if (call.name === 'escalate_to_boss' && !isAdmin && org.config?.adminPhone) {
            console.log(`📣 ESCALATION: ${args.reason}`);
            try {
              const customerName = job.data.name || 'Unknown';
              const alertMessage = `📣 [ESCALATION NEEDED]\nOga, I need help with Customer *${customerName}* (${from}).\nReason: ${args.reason}`;
              await tenantWhatsAppService.sendText(org.config.adminPhone, alertMessage);
              functionResponses.push({ functionResponse: { name: 'escalate_to_boss', response: { status: 'success', message: "I've informed the Boss. They will get back to you soon. How else can I help?" } } });
            } catch (e: any) {
              functionResponses.push({ functionResponse: { name: 'escalate_to_boss', response: { status: 'error', message: e.message } } });
            }
          }
        }
        if (functionResponses.length > 0) {
           result = await chatSession.sendMessage(functionResponses);
           responseText = result.response.text();
        }
      }
      
      // 8. Finalize Persistence
      // const storageUrl = mediaTask ? await mediaTask : null; // DISABLED
      await saveMessage(chatId, { 
        role: 'user', 
        content: userMessageContent, 
        type: type as any, 
        metadata: { messageId, mediaId } // FREE TIER PIVOT: Save mediaId
      });

      await saveMessage(chatId, { role: 'assistant', content: responseText, type: 'text' });

      // 8. Send Reply to WhatsApp (ONLY at the very end of a successful process)
      await tenantWhatsAppService.sendText(from, responseText);

      // 9. Low Balance Warning
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
      
      // --- Refund Logic ---
      // We ONLY refund if:
      // 1. We actually deducted balance (deductionDone)
      // 2. This is the FINAL attempt (attemptsMade >= attempts) OR it's a non-retryable error
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3) - 1; 
      
      if (!isAdmin && deductionDone && isFinalAttempt) {
          try {
            console.log(`💰 [FINAL FAILURE] Refunding ${costPerReply} kobo to org ${orgId}.`);
            await addBalance(orgId, costPerReply);
          } catch (refundError) {
            console.error(`❌ Refund failed for ${orgId}:`, refundError);
          }
      }

      // If we still have retries left, rethrow to let BullMQ handle backoff
      if (job.attemptsMade < (job.opts.attempts || 3)) {
        throw error;
      }

      // Final Failure: Send Fallback Message
      console.error(`Job ${job.id} permanently failed. Sending fallback.`);
      await tenantWhatsAppService.sendText(from, "I'm having trouble connecting right now. Please try again later.");
      
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
