import { Type } from '@google/genai';
import { logger } from '../utils/logger.js';
import { heartbeatService } from '../services/heartbeat.js';
import { getDb } from '@naija-agent/firebase';
import { lifeMemory } from '../services/lifeMemory.js';
import { FeedbackEvent, SystemConfig } from '@naija-agent/types';
import { whatsappService } from '../services/whatsapp.js';

export const SYSTEM_TOOLS = [
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
      description: 'Delegate a specialized task to a sub-agent. Choose the sector carefully: \n- "EducationPack": For quizzes, study plans, and educational research.\n- "LifePack": For searching the user\'s Vault (receipts, notes, alerts) or deleting data.\n- "ResearchPack": For browsing the live internet, fetching webpages, and general news.\n- "CommercePack": For shopping, pricing, and market comparisons.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          sector: { type: Type.STRING, enum: ["EducationPack", "LifePack", "ResearchPack", "CommercePack"], description: 'The specialized sector pack required.' },
          instruction: { type: Type.STRING, description: 'Clear, detailed instructions for the sub-agent. Include all context needed to execute the task.' }
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
];

const redactPII = (text: string): string => {
  let redacted = text.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '[EMAIL]');
  
  // Accurately target phone numbers (Nigerian local, international, with or without spaces/dashes)
  // Matches: 08012345678, +2348012345678, 234-80-1234-5678, 070-123-4567
  redacted = redacted.replace(/(?:\+?234|0)[-\s]?(?:70|80|81|90|91)[-\s]?\d{3}[-\s]?\d{4}/g, '[PHONE REDACTED]');
  
  // Target 10-digit Nigerian Bank Account numbers (often standalone or preceded by words like 'acct', 'account')
  // We use word boundaries \b to avoid matching the middle of a 12-digit number.
  redacted = redacted.replace(/\b\d{10}\b/g, '[ACCOUNT REDACTED]');
  
  // Target 16-19 digit Credit/Debit Card numbers (with optional spaces/dashes)
  redacted = redacted.replace(/\b(?:\d{4}[-\s]?){3,4}\d{1,3}\b/g, '[CARD REDACTED]');

  // Target PINs and OTPs specifically associated with keywords
  redacted = redacted.replace(/(?:pin|code|otp|password)[:\s]*\b\d{4,6}\b/gi, '[PIN/OTP REDACTED]');
  
  return redacted;
};

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
            const summary = await trySearch(SystemConfig.MODELS.AELIXXR_WORKER);
            return { status: 'success', result: summary };
          } catch (firstTryErr: any) {
             if (firstTryErr.message.includes('429') || firstTryErr.message.includes('503') || firstTryErr.message.includes('fetch failed') || firstTryErr.message.includes('500') || firstTryErr.message.includes('limit')) {
                logger.warn('🔄 [LIFE SEARCH FALLBACK] Quota Exceeded or Model Busy. Retrying with Fallback...');
                const secondSummary = await trySearch(SystemConfig.MODELS.AELIXXR_FALLBACK);
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
