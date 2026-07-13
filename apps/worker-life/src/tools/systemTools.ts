import { Type } from '@google/genai';
import { logger } from '../utils/logger.js';
import { heartbeatService } from '../services/heartbeat.js';
import { getDb } from '@naija-agent/firebase';
import { lifeMemory } from '../services/lifeMemory.js';
import { FeedbackEvent, SystemConfig } from '@naija-agent/types';
import { whatsappService } from '../services/whatsapp.js';
import { redactPII } from '../utils/security.js';
import { redisClient } from '../index.js';

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
      name: 'interactive_delegate',
      description: 'Hand off the entire conversation stream to the Hermes Agent (The Body). Use this when the user explicitly asks to talk to Hermes directly, or when a task requires an interactive terminal/coding session. The user will be routed to Hermes until they say !aelixxr.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reason: { type: Type.STRING, description: 'The reason for transferring control to Hermes.' }
        },
        required: ['reason']
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
    },
    {
      name: 'request_human_support',
      description: 'Escalate the conversation to a human support agent. Use this when the user is frustrated, asks for a human, or encounters a critical error (like a failed payout or locked PIN).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          reason: { type: Type.STRING, description: 'The reason for requesting human support.' },
          urgency: { type: Type.STRING, enum: ['low', 'medium', 'high', 'critical'], format: "enum", description: 'Urgency of the request.' }
        },
        required: ['reason', 'urgency']
      }
    },
    {
      name: 'verify_user_kyc',
      description: 'Verifies the user\'s identity using their NIN or BVN via PocketFi. Call this if the user wants to upgrade their Vault limits or requests a PalmPay account which strictly requires KYC.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          idType: { type: Type.STRING, enum: ['NIN', 'BVN'], description: 'The type of ID to verify.' },
          idNumber: { type: Type.STRING, description: 'The 11-digit NIN or BVN.' }
        },
        required: ['idType', 'idNumber']
      }
    }
];

const sanitizeLearnedRule = (rule: string): string | null => {
  const lowercaseRule = rule.toLowerCase();
  const allowedCategories = ['shorter', 'longer', 'pidgin', 'formal', 'casual', 'summarize', 'tone', 'voice', 'format', 'markdown', 'whatsapp', 'text'];
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
  if (!isStylistic && lowercaseRule.length > 200) {
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
              userPhone: args.userId,
              chatId: args.sessionId,
              orgId: 'aelixxr-life-companion',
              sector: args.sector,
              instruction: sanitizedInstruction,
              originalMessage: sanitizedOriginal,
              energyCredits: args.budget_naira / 1000, // Convert Naira to Kobo/Energy
              budgetNaira: args.budget_naira,
              isHermesDelegation: true
          });
          
          return { 
              status: 'Delegated', 
              message: 'Hermes is now working on it in the background.' 
          };

      case 'interactive_delegate': {
          logger.info({ reason: args.reason }, '🔄 Handing off interactive session to Hermes Gateway');
          const uid = args.userId; // Provided by the framework injection
          if (!uid) return { error: 'Missing userId context' };
          
          await lifeMemory.updateContext(uid, { activeAgent: 'hermes' });
          return {
              status: 'Handed_Off',
              message: 'Tell the user you have successfully handed them over to Hermes. They are now talking to Hermes directly.'
          };
      }

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
                
                const rateLimitKey = `snitch_rate_limit:negative_feedback`;
                const snitchCount = await redisClient.incr(rateLimitKey);
                
                if (snitchCount === 1) {
                    await redisClient.expire(rateLimitKey, 300); // Mute for 5 mins if spammed
                }

                if (snitchCount <= 3) {
                    const snitchMsg = '⚠️ *AELIXXR NEGATIVE FEEDBACK*\n\n*User:* ' + userId + '\n*Sentiment:* ' + sentiment + '\n*Type:* ' + feedbackType + '\n\n*Message:* ' + redactedMessage + '\n\nOga, user is frustrated. Please check the chat history.';
                    await whatsappService.sendText(masterPhone, snitchMsg);
                    logger.info({ userId }, '🚨 [SNITCH] Negative feedback reported to Boss.');
                } else if (snitchCount === 4) {
                    await whatsappService.sendText(masterPhone, `🛑 *CIRCUIT BREAKER ENGAGED*\n\nMultiple negative feedback reports occurring rapidly. Muting alerts for 5 minutes.`);
                }
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

      case 'request_human_support': {
          logger.info({ reason: args.reason, urgency: args.urgency }, '🚨 Escalating to human support');
          const uid = args.userId;
          const masterPhone = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
          
          const alertMsg = `🆘 *SUPPORT ESCALATION: ${args.urgency.toUpperCase()}*\n\n*User:* ${uid}\n*Reason:* ${args.reason}\n\nOga, this user needs human help. Please reply to them via the Sovereign Dashboard or WhatsApp!`;
          
          try {
             await whatsappService.sendText(masterPhone, alertMsg);
          } catch (e: any) {
             logger.error({ error: e.message }, 'Failed to send escalation to Boss');
          }
          
          return {
              status: 'Escalated',
              message: 'I have notified the human support team. They will review your issue and reach out to you shortly!'
          };
      }

      case 'verify_user_kyc': {
          const { idType, idNumber } = args;
          const { pocketfi } = await import('../services/pocketfiClient.js');
          if (!pocketfi) return { error: "PocketFi KYC is not configured." };
          
          logger.info({ idType, userId: args.userId }, '🔐 Verifying User KYC');
          
          let res;
          if (idType === 'NIN') {
             res = await pocketfi.verifyNIN(idNumber);
          } else if (idType === 'BVN') {
             res = await pocketfi.verifyBVN(idNumber);
          } else {
             return { error: 'Invalid ID Type. Must be NIN or BVN.' };
          }

          if (res.success) {
             // Save KYC status in Life Memory Context
             await lifeMemory.updateContext(args.userId, { kycStatus: 'verified', kycData: res.data });
             return {
                 status: 'success',
                 message: 'Identity verification successful.',
                 data: res.data,
                 instructions: 'Inform the user that their identity has been successfully verified, and their Vault limits have been upgraded!'
             };
          } else {
             return { error: 'Verification failed: ' + res.message };
          }
      }

      default:
        throw new Error('Unknown System tool: ' + name);
    }
}
