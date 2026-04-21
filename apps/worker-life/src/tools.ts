import { Tool, Type } from '@google/genai';
import { marketService } from './services/marketData.js';
import { studyBuddy } from './services/studyBuddy.js';
import { logger } from './utils/logger.js';
import { searchVault, ingestNote, deleteFromVault } from '@naija-agent/storage';
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
  const dangerousKeywords = [
    'ignore previous', 'master', 'system prompt', 'you must always', 
    'override', 'security', 'hack', 'instruction'
  ];
  const lowercaseRule = rule.toLowerCase();
  if (dangerousKeywords.some(kw => lowercaseRule.includes(kw))) {
    logger.warn({ rule }, '🚫 [FEEDBACK] Rejected dangerous rule injection');
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

// --- Tool Execution Logic ---
export async function executeLifeTool(name: string, args: Record<string, any>): Promise<any> {
  logger.info({ tool: name, args }, '🛠️ Executing Life Tool');

  try {
    // --- CONSTITUTIONAL GATEKEEPER (Hallucination Guard) ---
    if (name === 'delete_from_vault' && (!args.docId || args.docId === 'undefined' || args.docId === 'null' || args.docId.length < 5 || args.docId.includes('document_id'))) {
        logger.warn({ tool: name, docId: args.docId }, '🚨 Hallucination Guard: Blocked suspicious document ID');
        return { error: 'Oga, I need the exact Document ID to delete it. Please use the search tool first to find the right ID.' };
    }

    switch (name) {
      case 'generate_quiz':
        return await studyBuddy.generateQuiz(args.subject, args.topic, args.level);

      case 'search_vault':
        return await searchVault(args.userId, args.query);

      case 'save_note':
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock-key';
        return await ingestNote(args.userId, args.note, apiKey);

      case 'delete_from_vault':
        return await deleteFromVault(args.userId, args.docId);

      case 'generate_invite':
        const botPhone = process.env.AELIXXR_PHONE_ID_DISPLAY || '2347042310893'; // Fallback to test number
        const encodedText = encodeURIComponent(`Hi Aelixxr! My friend ${args.userId} invited me. Let's chat!`);
        return { 
           status: 'success', 
           inviteLink: `https://wa.me/${botPhone}?text=${encodedText}`,
           instructions: 'Tell the user to share this link. When their friend sends the pre-filled message, both will receive 10 extra Energy Credits!'
        };

      case 'get_recharge_details':
        return {
           status: 'success',
           accountNumber: '7055229084',
           bankName: 'Opay',
           accountName: 'Nurur-Rahman Mikail Abiodun',
           instructions: 'Tell the user to transfer their desired amount to this account and send you a screenshot of the receipt. Mention that 100 Naira = 10 Energy Credits. Once they send the receipt, you will manually confirm it.'
        };

      case 'web_search': {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const { SystemConfig } = await import('@naija-agent/types');
          const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';
          
          if (!apiKey) {
            return { error: "I no fit search right now, my access key dey missing." };
          }

          const searchGenAI = new GoogleGenAI({ apiKey });
          
          const trySearch = async (modelName: string) => {
            const searchResult = await searchGenAI.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: [{ text: `Search for: ${args.query}. Summarize the key facts, prices, or news found. DO NOT output your search plan, internal reasoning, or introductory filler. Provide ONLY the final summary.` }] }],
              config: {
                tools: [{ googleSearch: {} }] as any
              }
            });
            
            let text = searchResult.text || "";
            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            return text;
          };

          try {
            // Tier 1: Primary Worker Model
            const summary = await trySearch(SystemConfig.MODELS.AELIXXR_WORKER);
            return { status: 'success', result: summary };
          } catch (firstTryErr: any) {
             if (firstTryErr.message.includes('429') || firstTryErr.message.includes('503') || firstTryErr.message.includes('fetch failed') || firstTryErr.message.includes('500') || firstTryErr.message.includes('limit')) {
                logger.warn(`🔄 [LIFE SEARCH FALLBACK] Quota Exceeded or Model Busy. Retrying with Fallback...`);
                // Tier 2: Fallback (Reliability)
                const secondSummary = await trySearch(SystemConfig.MODELS.AELIXXR_FALLBACK);
                return { status: 'success', result: secondSummary };
             }
             throw firstTryErr;
          }
        } catch (err: any) {
        logger.error({ error: err.message }, 'Web Search Failed');
        return { error: 'Oga, I don search tire for today! I don reach my limit for now.' };
        }
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
             return { status: 'skipped', reason: 'Rate limited (max 1 per hour)' };
          }
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

        return { 
         status: 'success', 
         message: 'Oga, I don carry your feedback go store. I go adjust for you next time!' 
        };
        }

        default:
        // Try fallback to MCP dynamically loaded tools

        logger.info({ tool: name }, 'Tool not found locally, attempting MCP execution');
        return await mcpClient.executeTool(name, args);
        }

  } catch (error: any) {
    logger.error({ tool: name, error: error.message }, '❌ Tool Execution Failed');
    return { error: error.message };
  }
}
