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
import { SectorPack } from '@naija-agent/types';
import { AIProvider, AIMessage } from '@naija-agent/ai';
import { promptService } from '../services/promptService.js';

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
  const expectingPinKey = `expecting_pin:${orgId}:${from}`;
  const isExpectingPin = await redisClient.get(expectingPinKey);
  const textTrimmed = content.text?.trim() || '';

  let isPinAttempt = false;
  let pinAttempt = '';

  if (isManager && type === 'text' && textTrimmed) {
      if (isExpectingPin && /^\d{4}$/.test(textTrimmed)) { isPinAttempt = true; pinAttempt = textTrimmed; }
      else if (/^#\d{4}$/.test(textTrimmed)) { isPinAttempt = true; pinAttempt = textTrimmed.substring(1); }
      else if (/^PIN\s+\d{4}$/i.test(textTrimmed)) { isPinAttempt = true; pinAttempt = textTrimmed.split(/\s+/)[1]; }
  }

  if (isPinAttempt) {
      await redisClient.del(expectingPinKey);
      const { setAdminAuth } = await import('@naija-agent/firebase');
      const bcrypt = await import('bcrypt');
      let isAuthenticated = false;
      if (isAdmin) {
          const storedHash = org.config?.adminPin;
          if (storedHash) { if (await bcrypt.compare(pinAttempt, storedHash)) { await setAdminAuth(orgId, from); isAuthenticated = true; } }
          else if (pinAttempt === '1234') { await setAdminAuth(orgId, from); isAuthenticated = true; }
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
              await redisClient.setex(expectingPinKey, 300, '1');
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
      const priceRegex = getPriceGuardRegex(currency.symbol, currency.code);
      if (priceRegex.test(finalMessage)) {
          const allProducts = await getProducts(orgId);
          const matches = [...finalMessage.matchAll(priceRegex)];
          for (const match of matches) {
              const p = parsePrice(match[0], currency.symbol, currency.code);
              if (p && !allProducts.some(prod => Math.abs(prod.price - p) < 1)) {
                  finalMessage = finalMessage.replace(match[0], `${currency.symbol}[Verification Pending]`);
              }
          }
      }
  }

  await tenantWhatsAppService.sendText(from, finalMessage);
  await saveMessage(chatId, { role: 'user', content: userMessageContent, type: type as any });
  await saveMessage(chatId, { role: 'assistant', content: finalMessage, type: 'text' });

  return { success: true };
}
