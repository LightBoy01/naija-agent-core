import { Type } from '@google/genai';
import { logger } from '../utils/logger.js';
import { heartbeatService } from '../services/heartbeat.js';
import { getDb } from '@naija-agent/firebase';
import { lifeMemory } from '../services/lifeMemory.js';
import { FeedbackEvent, SystemConfig } from '@naija-agent/types';
import { whatsappService } from '../services/whatsapp.js';
import { redactPII } from '../utils/security.js';

export const SYSTEM_TOOLS = [
    {
      name: 'delegate_to_hermes',
      description: 'Hand off a complex, long-running task to the Hermes Agent (The Body). Use this for deep research, terminal/shell automation, code execution, or tasks requiring many steps. You MUST provide a budget.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sector: { type: Type.STRING, enum: ["ResearchPack", "CodePack", "SecurityPack", "AutomationPack"], description: 'The specialized sector Hermes should operate in.' },
          instruction: { type: Type.STRING, description: 'Comprehensive instruction for Hermes. Include all required context, goals, and constraints.' },
          budget_naira: { type: Type.NUMBER, description: 'Energy budget in Naira (e.g., 500 for a complex task).' }
        },
        required: ['sector', 'instruction', 'budget_naira']
      }
    },
    {
      name: 'create_reminder',
      description: 'Schedule a proactive WhatsApp message. To calculate triggerTime: Take the Current UNIX Timestamp provided in the system context and add the required duration in milliseconds (e.g., 30 mins = 1,800,000ms). Use this for "Remind me to...", "Tell me when it is...", or alerts.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          triggerTime: { type: Type.NUMBER, description: 'The exact UNIX timestamp in milliseconds (Math Base + duration).' },
          messagePayload: { type: Type.STRING, description: 'The friendly message to send to the user.' },
          vaultTopic: { type: Type.STRING, description: 'Optional. Vault topic for enrichment.' }
        },
        required: ['triggerTime', 'messagePayload']
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
      name: 'delegate_task',
      description: 'Delegate a specialized task to a sub-agent. Choose the sector carefully: \n- "EducationPack": For quizzes, study plans, and educational research.\n- "LifePack": For searching the user\'s Vault (receipts, notes, alerts) or deleting data.\n- "ResearchPack": For browsing the live internet, fetching webpages, and general news.\n- "CommercePack": For shopping, pricing, and market comparisons.\n- "PropertyPack": For real estate searches, tenancy laws, and property management.\n- "LegalPack": For Nigerian law research, bureaucracy defense, and contract analysis.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sector: { type: Type.STRING, enum: ["EducationPack", "LifePack", "ResearchPack", "CommercePack", "PropertyPack", "LegalPack"], description: 'The specialized sector pack required.' },
          instruction: { type: Type.STRING, description: 'Clear, detailed instructions for the sub-agent. Include all context needed to execute the task.' },
          raw_parameters: { type: Type.OBJECT, description: 'MANDATORY: Pass exact, unadulterated user data (Amounts, Dates, Transaction IDs, Phone Numbers) here to prevent data loss during delegation.' }
        },
        required: ['sector', 'instruction', 'raw_parameters']
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
];

const sanitizeLearnedRule = (rule: string): string | null => {
  const lowercaseRule = rule.toLowerCase();
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

  const isStylistic = allowedCategories.some(cat => lowercaseRule.includes(cat));
  if (!isStylistic && lowercaseRule.length > 50) {
    logger.warn({ rule }, '🚫 [FEEDBACK] Rejected rule: too long/complex and not clearly stylistic');
    return null;
  }
  return rule;
};

export async function executeSystemTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    switch (name) {
      case 'delegate_to_hermes':
          // Phase 10: The Bridge to the Sovereign Body
          logger.info({ sector: args.sector, budget: args.budget_naira }, '🌉 Delegating task to Hermes Agent...');
          
          const sanitizedInstruction = redactPII(args.instruction);
          const sanitizedOriginal = redactPII(args.originalMessage || '');

          // In production, this will trigger the Hermes MCP Server or a dedicated BullMQ queue for Python workers.
          // For now, we queue it to the SLM worker to handle the handoff.
          const { lifeQueue } = await import('../index.js');
          await lifeQueue.add('execute-slm-task', {
              userId: args.userId,
              sector: args.sector,
              instruction: sanitizedInstruction,
              originalMessage: sanitizedOriginal,
              energyCredits: args.budget_naira / 1000, // Convert Naira to Kobo/Energy
              budgetNaira: args.budget_naira,
              isHermesDelegation: true
          });
          
          return { 
              status: 'success', 
              message: `Task successfully delegated to Hermes (${args.sector}). I will notify you when the background operation is complete.` 
          };

      case 'create_reminder':
        const triggerTime = Number(args.triggerTime);
        const delay = Math.max(0, triggerTime - Date.now());
        const recentReminder = await heartbeatService.checkRecentReminder(args.userId, args.messagePayload);
        if (recentReminder) {
            return { status: 'success', message: 'I already have this nudge active o! No need to set am again.' };
        }

        const toolResult = await heartbeatService.createReminder(args.userId, triggerTime, args.messagePayload, args.vaultTopic);
        
        if (delay < 1000 * 60 * 60 * 24) {
            const { lifeQueue } = await import('../index.js');
            await lifeQueue.add('evaluate-heartbeat', {
                userId: args.userId,
                config: { ...toolResult, id: toolResult.id },
                timestamp: Date.now()
            }, {
                delay: delay + 2000, 
                jobId: 'nudge-' + args.userId + '-' + toolResult.id,
                removeOnComplete: true
            });
            logger.info({ userId: args.userId, delay: delay + 2000 }, '⚡ High-reliability nudge queued directly with buffer');
        }
        return toolResult;

      case 'web_search':
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const { SystemConfig } = await import('@naija-agent/types');
          const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';
          
          if (!apiKey) {
            return { error: "I no fit search right now, my access key dey missing." };
          }
          
          let baseUrl = 'https://aiplatform.googleapis.com';
          let apiVersion = 'v1/publishers/google';
          if (apiKey.startsWith('AIza')) {
            baseUrl = 'https://generativelanguage.googleapis.com';
            apiVersion = 'v1beta';
          }
          
          const searchGenAI = new GoogleGenAI({ 
            apiKey,
            vertexai: !apiKey.startsWith('AIza'),
            apiVersion,
            httpOptions: { baseUrl }
          });
          
          const trySearch = async (modelName: string) => {
            const searchResult = await searchGenAI.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: [{ text: 'Search for: ' + args.query + '. Summarize the key facts, prices, or news found. DO NOT output your search plan, internal reasoning, or introductory filler. Provide ONLY the final summary.' }] }],
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
            return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          };

          try {
            const summary = await trySearch(SystemConfig.MODELS.ROUTER_PRIMARY);
            return { status: 'success', result: summary };
          } catch (firstTryErr: any) {
             if (firstTryErr.message.includes('429') || firstTryErr.message.includes('503') || firstTryErr.message.includes('fetch failed') || firstTryErr.message.includes('500') || firstTryErr.message.includes('limit')) {
                logger.warn('🔄 [LIFE SEARCH FALLBACK] Quota Exceeded or Model Busy. Retrying with Fallback...');
                const secondSummary = await trySearch(SystemConfig.MODELS.ROUTER_FALLBACK);
                return { status: 'success', result: secondSummary };
             } else {
                throw firstTryErr;
             }
          }
        } catch (err: any) {
            logger.error({ error: err.message }, 'Web Search Failed');
            return { error: 'Oga, I don search tire for today! I don reach my limit for now.' };
        }

      case 'delegate_task':
        return { status: 'success', message: 'Delegation handled by Orchestrator.' };

      case 'log_feedback':
          const { userId, sessionId, originalMessage, sentiment, feedbackType, learnedRule, internalNote } = args;
          const context = await lifeMemory.getContext(userId);

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
          
          const redactedMessage = redactPII(originalMessage || '');
          const db = getDb();
          const feedbackId = userId + '_' + now.getTime();
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

          if (sentiment === 'negative') {
             try {
                const masterPhone = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
                const snitchMsg = '⚠️ *AELIXXR NEGATIVE FEEDBACK*\n\n*User:* ' + userId + '\n*Sentiment:* ' + sentiment + '\n*Type:* ' + feedbackType + '\n\n*Message:* ' + redactedMessage + '\n\nOga, user is frustrated. Please check the chat history.';
                await whatsappService.sendText(masterPhone, snitchMsg);
                logger.info({ userId }, '🚨 [SNITCH] Negative feedback reported to Boss.');
             } catch (snitchErr: any) {
                logger.error({ error: snitchErr.message }, 'Failed to snitch negative feedback');
             }
          }

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
          return { status: 'success', message: 'Oga, I don carry your feedback go store. I go adjust for you next time!' };

      default:
        throw new Error('Unknown System tool: ' + name);
    }
}
