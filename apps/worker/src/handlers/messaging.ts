import { Job } from 'bullmq';
import { JobData, Message, StaffData } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import { 
  deductBalance,
  verifyAdminSession, getAllKnowledge, getProducts, logSystemEvent,
  Organization
} from '@naija-agent/firebase';
import {
  findOrCreateChat, getChatHistory, saveMessage
} from '@naija-agent/database';
import { Type } from '@google/genai';
import { PaymentProvider } from '@naija-agent/payments';
import { Redis } from 'ioredis';
import { handleToolCall } from '../tool-handlers.js';
import { AUTH_REQUIRED_TOOLS as PIN_PROTECTED_TOOLS } from '../tools/definitions.js';
import { getPriceGuardRegex, formatCurrency, parsePrice } from '../utils/currency.js';
import { formatInTimeZone } from 'date-fns-tz';
import { logger } from '../utils/logger.js';
import { SectorPack, SystemConfig } from '@naija-agent/types';
import { AIProvider, AIMessage } from '@naija-agent/ai';
import { promptService } from '../services/promptService.js';
import { PriceGuard } from '../services/priceGuard.js';

export interface MessagingDependencies {
  org: Organization;
  isAdmin: boolean;
  isStaff: boolean;
  staffData: StaffData | null;
  tenantWhatsAppService: WhatsAppService;
  tenantPaymentProvider: PaymentProvider | null;
  ai: AIProvider;
  redisClient: Redis;
  tenantTools: any[];
  sectorPack?: SectorPack;
}

export async function handleMessage(job: Job<JobData>, deps: MessagingDependencies): Promise<{ success: boolean; reason?: string }> {
  const { from, orgId, content, type, messageId } = job.data;
  const { org, isAdmin, isStaff, staffData, tenantWhatsAppService, tenantPaymentProvider, ai, redisClient, tenantTools } = deps;

  const isManager = isAdmin || isStaff;
  const textTrimmed = content.text?.trim() || '';

  // --- STATE-AWARE PIN INTERCEPTOR (PHASE 9.3) ---
  let isAwaitingPin = false;
  const sessionStatus = org.config?.sessionStatus;
  const sessionExpiry = org.config?.sessionExpiry;
  if (sessionStatus === 'AWAITING_PIN' && sessionExpiry) {
      if (new Date(sessionExpiry).getTime() > Date.now()) {
          isAwaitingPin = true;
      }
  }

  let isPinAttempt = !!job.data.isPinAttempt;
  let pinAttempt = textTrimmed;

  if (isManager && type === 'text' && textTrimmed) {
      // Standalone 4-digits: ONLY if state says we are waiting for it
      if (!isPinAttempt && isAwaitingPin && /^\d{4}$/.test(textTrimmed)) { 
          isPinAttempt = true; 
      }
      // Explicit overrides: Always allowed for managers
      else if (/^#\d{4}$/.test(textTrimmed)) { isPinAttempt = true; pinAttempt = textTrimmed.substring(1); }
      else if (/^PIN\s+\d{4}$/i.test(textTrimmed)) { isPinAttempt = true; pinAttempt = textTrimmed.split(/\s+/)[1]; }
  }

  if (isPinAttempt) {
      // Clear state on any attempt
      if (isAwaitingPin) {
          const { getDb } = await import('@naija-agent/firebase');
          await getDb().collection('organizations').doc(orgId).update({
              'config.sessionStatus': 'IDLE',
              'config.sessionExpiry': null
          });
      }

      const { setAdminAuth } = await import('@naija-agent/firebase');
      const bcrypt = await import('bcrypt');
      let isAuthenticated = false;
      if (isAdmin) {
          const storedHash = org.config?.adminPin;
          if (storedHash) { if (await bcrypt.compare(pinAttempt, storedHash)) { await setAdminAuth(orgId, from); isAuthenticated = true; } }
      } 
      if (isAuthenticated) await tenantWhatsAppService.sendText(from, `✅ *PIN Accepted!* Admin Mode unlocked.`);
      else await tenantWhatsAppService.sendText(from, `❌ *Incorrect PIN.*`);
      return { success: true };
  }

  const currency = { code: org.currency?.code || 'NGN', symbol: org.currency?.symbol || '₦', locale: org.currency?.locale || 'en-NG' };
  const orgTimeZone = org.timezone || 'Africa/Lagos';
  const currentLocalTime = formatInTimeZone(new Date(), orgTimeZone, 'yyyy-MM-dd HH:mm:ss');

  const businessKnowledge = await getAllKnowledge(orgId);
  const knowledgeContext = Object.entries(businessKnowledge).map(([key, val]) => `- ${key}: ${val}`).join('\n');
  const isCommandCenter = org.config?.commandCenterGroupId === from;
  
  if (isCommandCenter && !isAdmin && !isStaff) {
      logger.warn({ from, orgId }, `🛡️ [SECURITY] Blocked public user from interacting in Command Center`);
      return { success: true, reason: 'COMMAND_CENTER_RESTRICTED' };
  }

  // --- PHASE 10: TRIAD PROMPT RESOLUTION ---
  const globalProtocol = promptService.getPrompt('Zynux.Global.md') || '';
  let personaPrompt = '';

  if (org.config?.isMaster) {
      personaPrompt = isAdmin 
        ? promptService.getPrompt('Zynux.Master.md') 
        : `You are the Official Onboarding Specialist for Naija Agent. Guide this person to register a FREE trial. Use 'register_trial_interest'.`;
  } else if (isCommandCenter) {
      personaPrompt = promptService.getPrompt('Zynux.Dispatcher.md');
  } else if (isManager) {
      personaPrompt = promptService.getPrompt('Zynux.Staff.md');
  } else {
      personaPrompt = promptService.getPrompt('Zynux.Customer.md');
      const customDNA = org.systemPrompt || deps.sectorPack?.systemPrompt || '';
      if (customDNA) personaPrompt += `\n\n[BUSINESS DNA]: ${customDNA}`;
  }

  const isAuth = isAdmin ? await verifyAdminSession(orgId, from) : false;
  const adminStatus = isAdmin ? (isAuth ? 'AUTHENTICATED' : 'LOCKED') : 'STAFF_AUTHORIZED';

  const systemPrompt = `
${personaPrompt}

[SYSTEM CONTEXT]:
- Time: ${currentLocalTime} (${orgTimeZone})
- Currency: ${currency.code} (${currency.symbol})
- Admin Status: ${adminStatus}

[BUSINESS KNOWLEDGE]:
${knowledgeContext || 'Empty - Please tell me your prices so I can start selling!'}

${globalProtocol}
`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      internal_thoughts: { type: Type.STRING },
      whatsapp_message: { type: Type.STRING }
    },
    required: ["internal_thoughts", "whatsapp_message"]
  };

  const chatId = await findOrCreateChat(orgId, from, job.data.name || 'User');
  const history = await getChatHistory(chatId, 10);
  
  const normalizedHistory: AIMessage[] = history.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
  }));

  const tenantModelName = org.config?.model || SystemConfig.MODELS.ZYNUX_PRIMARY;
  let userMessageContent = "";
  let mediaBuffer: Buffer | null = null;
  let mediaMime: string | null = null;

  if (type === 'text' && content.text) {
    userMessageContent = content.text;
  } else if (type === 'audio' || type === 'image' || type === 'document') {
    const mediaId = content.audioId || content.imageId || content.documentId;
    const { buffer, mimeType } = await tenantWhatsAppService.downloadMedia(mediaId!);
    mediaBuffer = buffer;
    mediaMime = mimeType;
    userMessageContent = `[${type.toUpperCase()}]`;
  }

  let aiResponse;
  if (type === 'image' && mediaBuffer && mediaMime) {
      aiResponse = await ai.analyzeImage(mediaBuffer, mediaMime, content.caption || "Analyze this", {
          model: tenantModelName,
          systemInstruction: systemPrompt,
          tools: tenantTools,
          responseMimeType: "application/json",
          responseSchema
      });
  } else {
      aiResponse = await ai.chat(normalizedHistory, content.text || "[Media]", {
          model: tenantModelName,
          systemInstruction: systemPrompt,
          tools: tenantTools,
          responseMimeType: "application/json",
          responseSchema
      });
  }

  let responseText = aiResponse.text;
  const functionCalls = aiResponse.functionCalls;

  if (functionCalls && functionCalls.length > 0) {
      const toolHistory: AIMessage[] = [
          ...normalizedHistory,
          { role: 'user', parts: [{ text: content.text || "[Media]" }] },
          { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) }
      ];

      const toolResponseParts: any[] = [];
      for (const call of functionCalls) {
          const isProtected = PIN_PROTECTED_TOOLS.includes(call.name);
          if (isProtected && (!isAdmin || !isAuth)) {
              const { getDb } = await import('@naija-agent/firebase');
              await getDb().collection('organizations').doc(orgId).update({
                  'config.sessionStatus': 'AWAITING_PIN',
                  'config.sessionExpiry': new Date(Date.now() + 300000).toISOString() // 5 mins
              });
              toolResponseParts.push({ functionResponse: { name: call.name, response: { status: 'error', code: 'AUTH_REQUIRED' } } });
              continue;
          }
          const response = await handleToolCall(call.name, call.args, { ...deps, orgId, from, isAuth, isVisionContext: type === 'image' });
          toolResponseParts.push({ functionResponse: { name: call.name, response } });
      }

      if (toolResponseParts.length > 0) {
          toolHistory.push({ role: 'function', parts: toolResponseParts });
          const followUp = await ai.chat(toolHistory, "Continue processing based on tool results.", {
              model: tenantModelName,
              systemInstruction: systemPrompt,
              tools: tenantTools,
              responseMimeType: "application/json",
              responseSchema
          });
          responseText = followUp.text;
          
          if (followUp.thinking) {
              try {
                  const parsed = JSON.parse(responseText);
                  parsed.internal_thoughts = `[AI REASONING]: ${followUp.thinking}\n\n${parsed.internal_thoughts}`;
                  responseText = JSON.stringify(parsed);
              } catch (e) {}
          }
      }
  }

  try {
      const parsed = JSON.parse(responseText);
      responseText = parsed.whatsapp_message || responseText;
  } catch (e) {
      logger.warn({ responseText }, "JSON Parse failed in Zynux");
  }

  let finalMessage = responseText || "Oga, try talk again.";
  
  if (!isAdmin && !isStaff) {
      // --- DETERMINISTIC PRICE GUARD (PHASE 9.3) ---
      const priceGuard = new PriceGuard(ai);
      const guardResult = await priceGuard.validateResponse(finalMessage, businessKnowledge, currency);
      
      if (!guardResult.isSafe) {
          logger.error({ reason: guardResult.mismatchReason }, "🛑 [PRICE GUARD] Hallucination Blocked!");
          
          // Re-try once with correction instruction
          const correctionPrompt = `The previous response contained a price hallucination: ${guardResult.mismatchReason}\n\n${guardResult.suggestedCorrection}\n\nRegenerate the response with the CORRECT prices. Output JSON.`;
          const recovery = await ai.chat(normalizedHistory, correctionPrompt, {
              model: tenantModelName,
              systemInstruction: systemPrompt,
              tools: tenantTools,
              responseMimeType: "application/json",
              responseSchema
          });
          
          try {
              const parsed = JSON.parse(recovery.text);
              finalMessage = parsed.whatsapp_message || finalMessage;
              logger.info("✅ [PRICE GUARD] Response corrected and recovered.");
          } catch (e) {
              finalMessage = "I'm sorry, I encountered an internal error verifying our prices. Please ask me again or check with the Boss.";
          }
      }
  }

  await tenantWhatsAppService.sendText(from, finalMessage);
  await saveMessage(chatId, { role: 'user', content: userMessageContent, type: type as any });
  await saveMessage(chatId, { role: 'assistant', content: finalMessage, type: 'text' });

  return { success: true };
}
