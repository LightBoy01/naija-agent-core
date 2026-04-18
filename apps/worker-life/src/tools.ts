import { Tool, SchemaType } from '@google/generative-ai';
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
        type: SchemaType.OBJECT,
        properties: {
          subject: { type: SchemaType.STRING, description: 'The subject (e.g. Mathematics, English, Biology)' },
          topic: { type: SchemaType.STRING, description: 'The specific topic (e.g. Algebra, Oral English, Photosynthesis)' },
          level: { type: SchemaType.STRING, description: 'The level (e.g. SS3, WAEC, JAMB, 100 Level)' }
        },
        required: ['subject', 'topic']
      }
    },
    {
      name: 'search_vault',
      description: 'Search the user\'s personal document vault for receipts, bank alerts, contracts, or saved notes.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: 'The search term (e.g. "GTBank", "School Fees", "Rent").' }
        },
        required: ['query']
      }
    },
    {
      name: 'save_note',
      description: 'Save a text-based memory or note to the Vault. Use this when the user says "Remember this", "Save this note", or tells you a fact they want to recall later.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          note: { type: SchemaType.STRING, description: 'The text content to save (e.g. "Gate code is 1234", "Auntie Tope\'s birthday is Oct 5").' }
        },
        required: ['note']
      }
    },
    {
      name: 'delete_from_vault',
      description: 'Delete a document or note from the Vault using its ID.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          docId: { type: SchemaType.STRING, description: 'The unique ID of the document/note to delete.' }
        },
        required: ['docId']
      }
    },
    {
      name: 'web_search',
      description: 'Search the live internet for general knowledge, news, facts, and live information.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: 'The search query (e.g. "Latest news in Nigeria today", "Who won the Champions League match yesterday?").' }
        },
        required: ['query']
      }
    },
    {
      name: 'generate_invite',
      description: 'Generate a referral invite link for the user to invite a friend. Explain the "Give 10, Get 10" energy bonus.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          action: { type: SchemaType.STRING, description: 'Always pass "generate"' }
        },
        required: ['action']
      }
    },
    {
      name: 'delegate_task',
      description: 'Delegate a complex task or research request to a specialized sub-agent (Small Language Model). Use this when you need an expert to execute tools or analyze data on your behalf.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          sector: { type: SchemaType.STRING, description: 'The sector pack required. Must be one of: "EducationPack", "LifePack", "ResearchPack", or "CommercePack".' },
          instruction: { type: SchemaType.STRING, description: 'Clear, detailed instructions for the sub-agent on what exactly you need them to do or find out.' }
        },
        required: ['sector', 'instruction']
      }
    },
    {
      name: 'log_feedback',
      description: 'Use this tool when the user provides explicit feedback (e.g., "Good job", "I hate this", "Make it shorter next time") or when you detect strong frustration in their message.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          sentiment: { type: SchemaType.STRING, enum: ['positive', 'negative', 'neutral'], format: "enum", description: 'The overall sentiment of the user feedback.' },
          feedbackType: { type: SchemaType.STRING, enum: ['explicit', 'implicit'], format: "enum", description: 'Whether the feedback was directly stated or inferred from context.' },
          learnedRule: { type: SchemaType.STRING, description: 'Optional. A new communication rule to add to the user\'s memory (e.g., "User prefers short answers").' },
          internalNote: { type: SchemaType.STRING, description: 'Optional. Internal note explaining the reason for logging this feedback.' }
        },
        required: ['sentiment', 'feedbackType']
      }
    },
    {
      name: 'update_life_context',
      description: 'PERMANENTLY save the user\'s core personal details to long-term memory. Use this IMMEDIATELY whenever the user mentions their name, family members, health conditions, future goals, or personal preferences. This is the only way to ensure you don\'t forget these details in the next session.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          fullName: { type: SchemaType.STRING, description: 'The user\'s full name.' },
          family: {
            type: SchemaType.OBJECT,
            properties: {
              spouse: { type: SchemaType.STRING },
              children: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    age: { type: SchemaType.NUMBER },
                    school: { type: SchemaType.STRING }
                  }
                }
              }
            }
          },
          health: {
            type: SchemaType.OBJECT,
            properties: {
              allergies: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              medications: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
            }
          },
          goals: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'User goals like "Japa by 2027" or "Buy a car".' },
          preferences: {
            type: SchemaType.OBJECT,
            properties: {
              market: { type: SchemaType.STRING },
              diet: { type: SchemaType.STRING }
            }
          }
        }
      }
    }
  ],
};

export const LIFE_TOOLS: Tool[] = [STATIC_LIFE_TOOLS];

export async function getLifeTools(): Promise<Tool[]> {
  const tools = [STATIC_LIFE_TOOLS];
  
  try {
    const mcpTools = await mcpClient.getGeminiTools();
    if (mcpTools && mcpTools.length > 0) {
      tools.push({ functionDeclarations: mcpTools });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to append MCP tools');
  }

  return tools;
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

      case 'web_search': {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const { SystemConfig } = await import('@naija-agent/types');
          const searchGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '');
          
          const trySearch = async (modelName: string) => {
            const searchModel = searchGenAI.getGenerativeModel({ 
              model: modelName,
              tools: [{ googleSearch: {} }] as any
            });

            const searchResult = await searchModel.generateContent({
              contents: [{ role: 'user', parts: [{ text: `Search for: ${args.query}. Summarize the key facts, prices, or news found. DO NOT output your search plan, internal reasoning, or introductory filler. Provide ONLY the final summary.` }] }]
            });
            
            let text = searchResult.response.text();
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

        case 'update_life_context': {
        const { userId, ...updates } = args;
        await lifeMemory.updateContext(userId, updates);
        return { status: 'success', message: 'I have updated my long-term memory of your life context. I will remember this forever!' };
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
