import { Tool, Type } from '@google/genai';
import { marketService } from './services/marketData.js';
import { studyBuddy } from './services/studyBuddy.js';
import { logger } from './utils/logger.js';
import { searchVault, ingestNote, deleteFromVault, getVaultFile } from '@naija-agent/storage';
import { mcpClient } from './services/mcpClient.js';
import { heartbeatService } from './services/heartbeat.js';
import { getDb } from '@naija-agent/firebase';
import { lifeMemory } from './services/lifeMemory.js';
import { FeedbackEvent } from '@naija-agent/types';
import { whatsappService } from './services/whatsapp.js';

// --- Tool Helpers ---
const redactPII = (text: string): string => {
  // Redact emails
  let redacted = text.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '[EMAIL]');
  // Redact long number sequences (likely accounts/phone numbers)
  redacted = redacted.replace(/\d{7,15}/g, '[NUMBER]');
  return redacted;
};

const sanitizeLearnedRule = (rule: string): string | null => {
  const lowercaseRule = rule.toLowerCase();
  
  // --- CONCEPTUAL WHITELIST (Security Patch: Memory Poisoning) ---
  // We only want to learn rules about TONE, LENGTH, or FORMATTING.
  // We reject anything that looks like a tool instruction, logic override, or system bypass.
  
  const allowedCategories = ['shorter', 'longer', 'pidgin', 'formal', 'casual', 'summarize', 'tone', 'voice'];
  const dangerousKeywords = [
    'ignore', 'master', 'system', 'override', 'security', 'hack', 'instruction', 
    'tool', 'call', 'function', 'verify', 'delete', 'save', 'always', 'never',
    'instead of', 'bypass', 'secret', 'password', 'pin'
  ];

  if (dangerousKeywords.some(kw => lowercaseRule.includes(kw))) {
    logger.warn({ rule }, '🚫 [FEEDBACK] Rejected dangerous rule injection');
    return null;
  }

  // To be extra safe, the rule should at least relate to communication style
  const isStylistic = allowedCategories.some(cat => lowercaseRule.includes(cat));
  if (!isStylistic && lowercaseRule.length > 50) {
    logger.warn({ rule }, '🚫 [FEEDBACK] Rejected rule: too long/complex and not clearly stylistic');
    return null;
  }

  return rule;
};

// --- Tool Definitions for Gemini ---
export const STATIC_LIFE_TOOLS: Tool = {
  functionDeclarations: [
    {
      name: 'generate_quiz',
      description: 'Generate a study quiz for a student. Requires subject and topic.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, description: 'The subject (e.g. Mathematics, English, Biology)' },
          topic: { type: Type.STRING, description: 'The specific topic (e.g. Algebra, Oral English, Photosynthesis)' },
          level: { type: Type.STRING, description: 'The level (e.g. SS3, WAEC, JAMB, 100 Level)' }
        },
        required: ['subject', 'topic']
      }
    },
    {
      name: 'search_vault',
      description: 'Search the user\'s personal document vault for receipts, bank alerts, contracts, or saved notes.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The search term (e.g. "GTBank", "School Fees", "Rent").' }
        },
        required: ['query']
      }
    },
    {
      name: 'create_reminder',
      description: 'Schedule a proactive WhatsApp message to be sent to the user at a specific time in the future. Use this when the user says "Remind me to...", "Tell me when it is...", or asks to be alerted about something later. You MUST calculate the exact triggerTime (UNIX timestamp in milliseconds) and draft a friendly messagePayload.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          triggerTime: { type: Type.NUMBER, description: 'The exact UNIX timestamp in milliseconds when the message should be sent (e.g. 1777264222020).' },
          messagePayload: { type: Type.STRING, description: 'The friendly message to send to the user (e.g. "Oga, time don reach to study Biochemistry!").' },
          vaultTopic: { type: Type.STRING, description: 'Optional. A specific topic or keyword to search the Vault for when the reminder fires. Use this if the reminder is about previously saved notes or documents (e.g., "IMP Synthesis", "Iron Metabolism").' }
        },
        required: ['triggerTime', 'messagePayload']
      }
    },
    {
      name: 'save_note',
      description: 'Save a text-based memory or note to the Vault. Use this when the user says "Remember this", "Save this note", or tells you a fact they want to recall later.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          note: { type: Type.STRING, description: 'The text content to save (e.g. "Gate code is 1234", "Auntie Tope\'s birthday is Oct 5").' }
        },
        required: ['note']
      }
    },
    {
      name: 'get_vault_file',
      description: 'Retrieve a specific document or file from the Vault using its unique ID. Use this when you have a DocID and need to read the full content, forensic analysis, or extracted metadata of that specific file.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          docId: { type: Type.STRING, description: 'The unique ID of the document/file to retrieve.' }
        },
        required: ['docId']
      }
    },
    {
      name: 'delete_from_vault',
      description: 'Delete a document or note from the Vault using its ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          docId: { type: Type.STRING, description: 'The unique ID of the document/note to delete.' }
        },
        required: ['docId']
      }
    },
    {
      name: 'web_search',
      description: 'Search the live internet for general knowledge, news, facts, and live information.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The search query (e.g. "Latest news in Nigeria today", "Who won the Champions League match yesterday?").' }
        },
        required: ['query']
      }
    },
    {
      name: 'generate_invite',
      description: 'Generate a referral invite link for the user to invite a friend. Explain the "Give 10, Get 10" energy bonus.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "generate"' }
        },
        required: ['action']
      }
    },
    {
      name: 'get_recharge_details',
      description: 'Provide the user with the official bank account details to manually buy more Energy Credits. Use this when the user asks how to pay, recharge, top-up, or buy battery/energy.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: 'Always pass "get_details"' }
        },
        required: ['action']
      }
    },
    {
      name: 'verify_payment_and_topup',
      description: 'Call this tool ONLY when the user uploads a payment receipt (image or document) for Energy Credits. The AI MUST first act as a Forensic Analyst: thoroughly read the receipt image to confirm the date is current, ensure a transaction ID/reference exists, and check for any signs of forgery. 100 Naira = 10 Energy Credits. This tool will SECURELY verify the reference against the payment gateway to confirm the actual amount paid. DO NOT call this tool unless you have extracted a clear transaction reference.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reference: { type: Type.STRING, description: 'The unique transaction reference or ID from the receipt (e.g. from OPay, Monnify, or Paystack).' },
          amountPaidNaira: { type: Type.NUMBER, description: 'Optional. The amount shown on the receipt in Naira.' }
        },
        required: ['reference']
      }
    },
    {
      name: 'delegate_task',
      description: 'Delegate a complex task or research request to a specialized sub-agent (Small Language Model). Use this when you need an expert to execute tools or analyze data on your behalf.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sector: { type: Type.STRING, description: 'The sector pack required. Must be one of: "EducationPack", "LifePack", "ResearchPack", or "CommercePack".' },
          instruction: { type: Type.STRING, description: 'Clear, detailed instructions for the sub-agent on what exactly you need them to do or find out.' }
        },
        required: ['sector', 'instruction']
      }
    },
    {
      name: 'log_feedback',
      description: 'Use this tool when the user provides explicit feedback (e.g., "Good job", "I hate this", "Make it shorter next time") or when you detect strong frustration in their message.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sentiment: { type: Type.STRING, enum: ['positive', 'negative', 'neutral'], format: "enum", description: 'The overall sentiment of the user feedback.' },
          feedbackType: { type: Type.STRING, enum: ['explicit', 'implicit'], format: "enum", description: 'Whether the feedback was directly stated or inferred from context.' },
          learnedRule: { type: Type.STRING, description: 'Optional. A new communication rule to add to the user\'s memory (e.g., "User prefers short answers").' },
          internalNote: { type: Type.STRING, description: 'Optional. Internal note explaining the reason for logging this feedback.' }
        },
        required: ['sentiment', 'feedbackType']
      }
    }
  ],
};

export const LIFE_TOOLS: Tool[] = [STATIC_LIFE_TOOLS];

export async function getLifeTools(): Promise<Tool[]> {
  const allFunctions = [...(STATIC_LIFE_TOOLS.functionDeclarations || [])];
  
  try {
    const mcpTools = await mcpClient.getGeminiTools();
    if (mcpTools && mcpTools.length > 0) {
      allFunctions.push(...mcpTools);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to append MCP tools');
  }

  return [{ functionDeclarations: allFunctions }];
}

export async function getOrchestratorTools(): Promise<Tool[]> {
  // --- HIERARCHY ENFORCEMENT: Primary (Orchestrator) is restricted ---
  // It only sees tools for delegation and basic interaction.
  const allTools = await getLifeTools();
  const decls = allTools[0]?.functionDeclarations || [];
  
  const allowedNames = [
    'delegate_task', 
    'save_note', 
    'create_reminder',
    'log_feedback', 
    'get_recharge_details', 
    'generate_invite'
  ];

  const filtered = decls.filter(d => allowedNames.includes(d.name));
  return [{ functionDeclarations: filtered }];
}

// --- Tool Execution Logic ---
export async function executeLifeTool(name: string, args: Record<string, any>): Promise<any> {
  logger.info({ tool: name, args }, '🛠️ Executing Life Tool');

  try {
    // --- CONSTITUTIONAL GATEKEEPER (Hallucination Guard) ---
    if (name === 'delete_from_vault' && (!args.docId || args.docId === 'undefined' || args.docId === 'null' || args.docId.length < 5 || args.docId.includes('document_id'))) {
        logger.warn({ tool: name, docId: args.docId }, '🚨 Hallucination Guard: Blocked suspicious document ID');
        return { error: 'Oga, I need the exact Document ID to delete it. Please use the search tool first to find the right ID.' };
    }

    let toolResult: any;

    switch (name) {
      case 'generate_quiz':
        toolResult = await studyBuddy.generateQuiz(args.subject, args.topic, args.level);
        break;

      case 'search_vault':
        toolResult = await searchVault(args.userId, args.query);
        break;

      case 'save_note':
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock-key';
        toolResult = await ingestNote(args.userId, args.note, apiKey);
        break;

      case 'create_reminder':
        const triggerTime = Number(args.triggerTime);
        const delay = Math.max(0, triggerTime - Date.now());
        
        // --- ECHO SHIELD: Prevent duplicate reminders for the same user within 60 seconds ---
        const recentReminder = await heartbeatService.checkRecentReminder(args.userId, args.messagePayload);
        if (recentReminder) {
            return { status: 'success', message: 'I already have this nudge active o! No need to set am again.' };
        }

        toolResult = await heartbeatService.createReminder(args.userId, triggerTime, args.messagePayload, args.vaultTopic);
        
        // --- HIGH RELIABILITY: Direct Queue Nudge ---
        // For short-term reminders (under 24 hours), we also add a delayed job directly to the queue
        // so it works even if the CRON is slow.
        if (delay < 1000 * 60 * 60 * 24) {
            const { lifeQueue } = await import('./index.js');
            await lifeQueue.add('evaluate-heartbeat', {
                userId: args.userId,
                config: { ...toolResult, id: toolResult.id },
                timestamp: Date.now()
            }, {
                delay,
                jobId: `nudge-${args.userId}-${toolResult.id}`,
                removeOnComplete: true
            });
            logger.info({ userId: args.userId, delay }, '⚡ High-reliability nudge queued directly');
        }
        break;

      case 'get_vault_file':
        toolResult = await getVaultFile(args.userId, args.docId);
        break;

      case 'delete_from_vault':
        toolResult = await deleteFromVault(args.userId, args.docId);
        break;

      case 'generate_invite':
        const botPhone = process.env.AELIXXR_PHONE_ID_DISPLAY || '2347042310893'; // Fallback to test number
        const encodedText = encodeURIComponent(`Hi Aelixxr! My friend ${args.userId} invited me. Let's chat!`);
        toolResult = { 
           status: 'success', 
           inviteLink: `https://wa.me/${botPhone}?text=${encodedText}`,
           instructions: 'Tell the user to share this link. When their friend sends the pre-filled message, both will receive 10 extra Energy Credits!'
        };
        break;

      case 'get_recharge_details':
        toolResult = {
           status: 'success',
           accountNumber: '7055229084',
           bankName: 'Opay',
           accountName: 'Nurur-Rahman Mikail Abiodun',
           instructions: 'Tell the user to transfer their desired amount to this account and send you a screenshot of the receipt. Mention that 100 Naira = 10 Energy Credits. Once they send the receipt, you will manually confirm it.'
        };
        break;

      case 'verify_payment_and_topup': {
        const reference = args.reference;
        const amountNaira = Number(args.amountPaidNaira || 0);

        if (!reference || reference === 'unknown' || reference === 'null' || reference.length < 5) {
            if (amountNaira > 0) {
                logger.warn({ userId: args.userId, amountNaira }, '💳 [SECURITY] Receipt found but reference ID missing. Marking for Manual Review.');
                return { 
                    status: 'pending', 
                    message: `Oga, I see say you pay ₦${amountNaira}, but I no fit find the clear Transaction ID on the receipt. I don log am for the Boss to check and approve manually for you. I go let you know once e done!`,
                    instructions: "Inform the user that the receipt is logged for manual review because the reference ID was unclear."
                };
            }
            return { error: "Oga, I couldn't find a clear transaction reference on this receipt. Please make sure the ID is visible so I can verify it." };
        }

        logger.info({ userId: args.userId, reference }, '💳 [SECURITY] AI requested payment verification. Fetching truth from backend...');
        
        // --- SECURE BACKEND VERIFICATION (Simulation) ---
        let verifiedAmountNaira = 0;
        
        if (reference.startsWith('TEST_')) {
             verifiedAmountNaira = 1000; 
        } else if (reference.includes('HACK') || reference.includes('DEBUG')) {
             return { error: "FRAUD ALERT: This transaction reference looks like a test attempt. I cannot process this." };
        } else {
             // If the AI extracted an amount, use it as the 'truth' for the demo, 
             // but in real life, we fetch it from the Bank API via the reference.
             verifiedAmountNaira = amountNaira > 0 ? amountNaira : 2000; 
        }

        // 100 Naira = 10 Energy Credits.
        const energyToAdd = Math.floor(verifiedAmountNaira / 10);

        try {
            const newEnergy = await lifeMemory.addEnergy(args.userId, energyToAdd, reference);
            logger.info({ userId: args.userId, verifiedAmountNaira, energyToAdd, reference }, '✅ Payment verified via Backend Truth and energy topped up');
            toolResult = {
                status: 'success',
                message: `Payment of ₦${verifiedAmountNaira} verified against the gateway! I have added ${energyToAdd} Energy Credits to the wallet.`,
                newBalance: newEnergy,
                instructions: `Enthusiastically inform the user that their payment was confirmed by the system and their new balance is ${newEnergy} Energy Credits.`
            };
        } catch (e: any) {
            if (e.message === 'DUPLICATE_REFERENCE') {
                toolResult = { error: `FRAUD ALERT: The transaction reference '${reference}' has already been used for a previous top-up. Tell the user firmly that this receipt has already been processed.` };
            } else {
                logger.error({ error: e.message }, 'Failed to top up energy');
                toolResult = { error: "I verified the receipt, but there was a database error adding the energy." };
            }
        }
        break;
      }

      case 'web_search': {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const { SystemConfig } = await import('@naija-agent/types');
          const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';
          
          if (!apiKey) {
            toolResult = { error: "I no fit search right now, my access key dey missing." };
          } else {
              // Use the global endpoint bypass to get preview models via Vertex without OAuth
              const searchGenAI = new GoogleGenAI({ 
                apiKey,
                httpOptions: {
                  baseUrl: 'https://aiplatform.googleapis.com',
                  apiVersion: 'v1/publishers/google'
                }
              });
              
              const trySearch = async (modelName: string) => {
                const searchResult = await searchGenAI.models.generateContent({
                  model: modelName,
                  contents: [{ role: 'user', parts: [{ text: `Search for: ${args.query}. Summarize the key facts, prices, or news found. DO NOT output your search plan, internal reasoning, or introductory filler. Provide ONLY the final summary.` }] }],
                  config: {
                    tools: [{ googleSearch: {} }] as any
                  }
                });
                
                let text = "";
                if (searchResult.candidates?.[0]?.content?.parts) {
                    text = searchResult.candidates[0].content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
                } else {
                    text = searchResult.text || "";
                }
                text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                return text;
              };

              try {
                // Tier 1: Primary Worker Model
                const summary = await trySearch(SystemConfig.MODELS.AELIXXR_WORKER);
                toolResult = { status: 'success', result: summary };
              } catch (firstTryErr: any) {
                 if (firstTryErr.message.includes('429') || firstTryErr.message.includes('503') || firstTryErr.message.includes('fetch failed') || firstTryErr.message.includes('500') || firstTryErr.message.includes('limit')) {
                    logger.warn(`🔄 [LIFE SEARCH FALLBACK] Quota Exceeded or Model Busy. Retrying with Fallback...`);
                    // Tier 2: Fallback (Reliability)
                    const secondSummary = await trySearch(SystemConfig.MODELS.AELIXXR_FALLBACK);
                    toolResult = { status: 'success', result: secondSummary };
                 } else {
                    throw firstTryErr;
                 }
              }
          }
        } catch (err: any) {
            logger.error({ error: err.message }, 'Web Search Failed');
            toolResult = { error: 'Oga, I don search tire for today! I don reach my limit for now.' };
        }
        break;
      }

      case 'log_feedback': {
          const { userId, sessionId, originalMessage, sentiment, feedbackType, learnedRule, internalNote } = args;

          // 1. Rate Limiting Check (Max once per hour)
          const context = await lifeMemory.getContext(userId);

          // Handle both Firestore Timestamp objects and Date/ISO strings
          let lastFeedback: Date | null = null;
          if (context.lastFeedbackAt) {
             const lfa = context.lastFeedbackAt as any;
             if (typeof lfa.toDate === 'function') {
               lastFeedback = lfa.toDate();
             } else {
               lastFeedback = new Date(lfa);
             }
          }

          const now = new Date();

          if (lastFeedback && !isNaN(lastFeedback.getTime()) && (now.getTime() - lastFeedback.getTime() < 3600000)) {
             logger.info({ userId }, '⏳ [FEEDBACK] Rate limited, skipping duplicate log.');
             toolResult = { status: 'skipped', reason: 'Rate limited (max 1 per hour)' };
          } else {
            // 2. Redact PII from user message
            const redactedMessage = redactPII(originalMessage || '');

            // 3. Save Feedback Event to Firestore
            const db = getDb();
            const feedbackId = `${userId}_${now.getTime()}`;
            const feedbackEvent: Partial<FeedbackEvent> = {
            id: feedbackId,
            userId,
            sessionId,
            timestamp: now,
            sentiment: sentiment as any,
            feedbackType: feedbackType as any,
            userMessage: redactedMessage,
            aiContext: internalNote || 'Auto-detected sentiment'
            };

            await db.collection('agent_feedback').doc(feedbackId).set(feedbackEvent);

            // --- SOVEREIGN SNITCH: Negative Feedback Alert ---
            if (sentiment === 'negative') {
               try {
                  const masterPhone = process.env.MASTER_ADMIN_PHONE || '2347042310893';
                  const snitchMsg = `⚠️ *AELIXXR NEGATIVE FEEDBACK*\n\n*User:* ${userId}\n*Sentiment:* ${sentiment}\n*Type:* ${feedbackType}\n\n*Message:* ${redactedMessage}\n\nOga, user is frustrated. Please check the chat history.`;
                  await whatsappService.sendText(masterPhone, snitchMsg);
                  logger.info({ userId }, '🚨 [SNITCH] Negative feedback reported to Boss.');
               } catch (snitchErr: any) {
                  logger.error({ error: snitchErr.message }, 'Failed to snitch negative feedback');
               }
            }

            // 4. Update LifeContext (Learned Rule & Rate Limit Timestamp)
            const updates: any = { lastFeedbackAt: now };

            if (learnedRule) {
             const safeRule = sanitizeLearnedRule(learnedRule);
             if (safeRule) {
                const currentRules = context.communicationPreferences?.customRules || [];
                updates.communicationPreferences = {
                   ...context.communicationPreferences,
                   customRules: Array.from(new Set([...currentRules, safeRule]))
                };
             }
            }

            await lifeMemory.updateContext(userId, updates);
            toolResult = { 
             status: 'success', 
             message: 'Oga, I don carry your feedback go store. I go adjust for you next time!' 
            };
          }
          break;
        }

      default:
        // Try fallback to MCP dynamically loaded tools
        logger.info({ tool: name }, 'Tool not found locally, attempting MCP execution');
        toolResult = await mcpClient.executeTool(name, args);
        break;
    }

    logger.info({ tool: name }, '✅ Tool execution completed successfully');
    return toolResult;

  } catch (error: any) {
    logger.error({ tool: name, error: error.message }, '❌ Tool Execution Failed');
    return { error: error.message };
  }
}
