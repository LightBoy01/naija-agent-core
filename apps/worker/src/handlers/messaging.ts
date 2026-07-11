import { Job } from 'bullmq';
import { JobData, Message, StaffData } from '@naija-agent/types';
import { WhatsAppService } from '../services/whatsapp.js';
import {
  findOrCreateChat, getChatHistory, saveMessage, verifyAdminSession,
  getOrgById, logSystemEvent, getChatDemoState, setChatDemoState,
  getAllKnowledge
} from '@naija-agent/database';

import { PaymentProvider } from '@naija-agent/payments';
import { Redis } from 'ioredis';
import { handleToolCall } from '../tool-handlers.js';
import { AUTH_REQUIRED_TOOLS as PIN_PROTECTED_TOOLS } from '../tools/definitions.js';
import { getPriceGuardRegex, formatCurrency, parsePrice } from '../utils/currency.js';
import { formatInTimeZone } from 'date-fns-tz';
import { logger } from '../utils/logger.js';
import { SectorPack, SystemConfig } from '@naija-agent/types';
import { deductOrgBalance } from '@naija-agent/database';
import { AIProvider, AIMessage } from '@naija-agent/ai';
import { promptService } from '../services/promptService.js';
import { PriceGuard } from '../services/priceGuard.js';

export interface MessagingDependencies {
  org: any; // Using any until we export the Drizzle type globally
  isAdmin: boolean;
  isStaff: boolean;
  staffData: StaffData | null;
  tenantWhatsAppService: WhatsAppService;
  tenantPaymentProvider: PaymentProvider | null;
  ai: AIProvider;
  redisClient: Redis;
  tenantTools: any[];
  sectorPack?: SectorPack;
  mediaBuffer?: Buffer | null;
  mediaMime?: string | null;
  systemPromptExtension?: string;
}

export async function handleMessage(job: Job<JobData>, deps: MessagingDependencies): Promise<{ success: boolean; reason?: string }> {
  const { from, orgId, content, type, messageId } = job.data;
  const { org, isAdmin, isStaff, staffData, tenantWhatsAppService, tenantPaymentProvider, ai, redisClient, tenantTools } = deps;

  // --- HUMAN AWARENESS OVERRIDE ---
  // If the Boss has sent a message manually to this chat recently, the Sidecar sets a lock.
  const humanLockKey = `human_active:${orgId}:${from}`;
  const isHumanActive = await redisClient.get(humanLockKey);
  
  if (isHumanActive && !isAdmin && !isStaff) {
      logger.info({ from, orgId }, "🤫 [HUMAN AWARE] AI paused for 30m because Boss is chatting manually.");
      return { success: true, reason: 'HUMAN_ACTIVE_OVERRIDE' };
  }

  const isManager = isAdmin || isStaff;
  const textTrimmed = content.text?.trim() || '';

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

  const chatId = await findOrCreateChat(orgId, from, job.data.name || 'User');
  const activeDemoNiche = await getChatDemoState(chatId);

  // --- HARDCODED DEMO ESCAPE HATCH ---
  // Support broader exit intents securely
  const exitRegex = /^(#exit|exit demo|exit|quit|cancel|stop)$/i;
  if (activeDemoNiche && exitRegex.test(textTrimmed)) {
      await setChatDemoState(chatId, null);
      await tenantWhatsAppService.sendText(from, "🛑 [SYSTEM: DEMO MODE ENDED. I am now Zynux again.]");
      return { success: true };
  }

  let finalTools = [...tenantTools];
  if (activeDemoNiche) {
      const { SYSTEM_TOOLS } = await import('../tools/system.js');
      // Dynamic import for SYSTEM_TOOLS to avoid circular deps — only when entering demo mode
      finalTools = [{ 
          functionDeclarations: SYSTEM_TOOLS.filter(t => t.name === 'toggle_demo_mode' || t.name === 'mock_checkout' || t.name === 'mock_product_info')
      }];
  }

  // --- PHASE 10: TRIAD PROMPT RESOLUTION ---
  const globalProtocol = promptService.getPrompt('Zynux.Soul.md') || '';
  let personaPrompt = '';

  if (activeDemoNiche) {
      const demoPrompt = promptService.getPrompt('Demo.Agent.md') || '';
      personaPrompt = demoPrompt.replace(/\{\{NICHE\}\}/g, activeDemoNiche);
  } else if (org.config?.isMaster) {
      personaPrompt = isAdmin 
        ? promptService.getPrompt('Master.Agent.md') 
        : promptService.getPrompt('Onboarding.Agent.md');
  } else if (isCommandCenter) {
      personaPrompt = promptService.getPrompt('Dispatcher.Agent.md');
  } else if (isManager) {
      personaPrompt = promptService.getPrompt('Staff.Agent.md');
  } else {
      personaPrompt = promptService.getPrompt('Customer.Agent.md');
      const customDNA = org.systemPrompt || deps.sectorPack?.systemPrompt || '';
      if (customDNA) personaPrompt += `\n\n[BUSINESS DNA]: ${customDNA}`;
  }

  const masterBotPhone = process.env.MASTER_BOT_PHONE || '2348000000000';
  const adminPhone = (org.config as any)?.adminPhone || from;
  
  personaPrompt = personaPrompt
      .replace(/\[Master_Bot_Number\]/g, masterBotPhone)
      .replace(/\[Your_Number\]/g, masterBotPhone)
      .replace(/<THEIR_PHONE_NUMBER>/g, from)
      .replace(/\[Your_Ogas_Phone_Number\]/g, adminPhone);

  let globalProtocolReady = globalProtocol
      .replace(/\[Master_Bot_Number\]/g, masterBotPhone)
      .replace(/\[Your_Ogas_Phone_Number\]/g, adminPhone);

  const isAuth = isAdmin ? await verifyAdminSession(orgId, from) : false;
  const adminStatus = isAdmin ? (isAuth ? 'AUTHENTICATED' : 'LOCKED') : (isStaff ? 'STAFF_AUTHORIZED' : 'NOT_AUTHENTICATED');

  const systemPrompt = `
${personaPrompt}

[SYSTEM CONTEXT]:
- UNIX Timestamp: ${Date.now()}
- Time: ${currentLocalTime} (${orgTimeZone})
- Currency: ${currency.code} (${currency.symbol})
- Admin Status: ${adminStatus}
- Demo Mode: ${activeDemoNiche ? `ACTIVE (Niche: ${activeDemoNiche})` : 'INACTIVE'}

[BUSINESS KNOWLEDGE]:
${activeDemoNiche ? 'Empty - Sandbox Mode. Make up fake items.' : (knowledgeContext || 'Empty - Please tell me your prices so I can start selling!')}

${globalProtocolReady}
${deps.systemPromptExtension || ''}

CRITICAL: Reply directly to the user with your final message. Do NOT include your internal thoughts or reasoning in the final text. Do not wrap your message in JSON or markdown code blocks.
`;

  const history = await getChatHistory(chatId, 10);
  
  const normalizedHistory: AIMessage[] = history.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
  }));

  const tenantModelName = org.config?.model || SystemConfig.MODELS.ZYNUX_PRIMARY;
  let userMessageContent = "";
  let mediaBuffer: Buffer | null = deps.mediaBuffer || null;
  let mediaMime: string | null = deps.mediaMime || null;

  if (type === 'text' && content.text) {
    userMessageContent = content.text;
  } else if (type === 'audio' || type === 'image' || type === 'document') {
    if (!mediaBuffer) {
        const mediaId = content.audioId || content.imageId || content.documentId;
        const { buffer, mimeType } = await tenantWhatsAppService.downloadMedia(mediaId!);
        mediaBuffer = buffer;
        mediaMime = mimeType;
    }
    userMessageContent = `[${type.toUpperCase()}]`;
  }

  let aiResponse;

  // --- TRIGGER TYPING INDICATOR ---
  tenantWhatsAppService.sendTypingIndicator(from).catch(e => 
      logger.warn({ error: e.message }, 'Failed to send typing indicator')
  );

  if (type === 'image' && mediaBuffer && mediaMime) {
      let analysisCaption = content.caption || "Analyze this image.";
      if ((deps as any).archivedMediaUrl) {
          analysisCaption += `\n\n[SYSTEM: The permanent URL for this uploaded image is: ${(deps as any).archivedMediaUrl}. If you need to save this product, use this exact URL.]`;
      }
      aiResponse = await ai.analyzeImage(mediaBuffer, mediaMime, analysisCaption, {
          model: tenantModelName,
          systemInstruction: systemPrompt,
          tools: finalTools
      });
  } else if (type === 'audio' && mediaBuffer && mediaMime) {
      aiResponse = await ai.chat(normalizedHistory, [
          { text: content.text || content.caption || "Transcribe this audio" },
          { inlineData: { data: mediaBuffer.toString('base64'), mimeType: mediaMime } }
      ], {
          model: tenantModelName,
          systemInstruction: systemPrompt,
          tools: finalTools
      });
  } else {
      const fallbackText = (type !== 'text' && !content.text) ? `[Unsupported Media: ${type}]` : (content.text || "[Empty Message]");
      aiResponse = await ai.chat(normalizedHistory, fallbackText, {
          model: tenantModelName,
          systemInstruction: systemPrompt,
          tools: finalTools
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
              await redisClient.setex(`expecting_pin:${orgId}:${from}`, 300, 'true');
              toolResponseParts.push({ functionResponse: { name: call.name, response: { status: 'error', code: 'AUTH_REQUIRED', message: 'CRITICAL: You must explicitly ask the user to reply with their 4-digit Admin PIN to unlock this tool. Do NOT attempt to call other tools to bypass this.' } } });
              continue;
          }
          let response: any;
          if (!isAdmin && !org.config?.isMaster) {
              const toolCost = SystemConfig.COSTS.TOOL_CALL_KOBO;
              const resultBalance = await deductOrgBalance(orgId, toolCost);
              if (resultBalance === null) {
                  toolResponseParts.push({ functionResponse: { name: call.name, response: { status: 'error', message: 'INSUFFICIENT_BALANCE: Tool execution aborted due to low balance. Tell the user we are briefly offline.' } } });
                  continue;
              }
          }

          try {
            response = await handleToolCall(call.name, call.args, { 
              orgId, from, isStaff, isAdmin, isAuth,
              whatsappService: tenantWhatsAppService,
              paymentProvider: tenantPaymentProvider,
              redisClient,
              orgConfig: org.config as any,
              currency: currency as any,
              whatsappPhoneId: job.data.phoneId,
              customerName: job.data.name,
              isVisionContext: type === 'image',
              sectorPack: deps.sectorPack
            });
          } catch (err: any) {
            logger.error({ tool: call.name, error: err.message, orgId }, 'Tool execution threw an error');
            response = { status: 'error', message: `Failed to execute ${call.name}: ${err.message}` };
          }
          toolResponseParts.push({ functionResponse: { name: call.name, response } });
      }

      if (toolResponseParts.length > 0) {
          toolHistory.push({ role: 'function', parts: toolResponseParts });
          const followUp = await ai.chat(toolHistory, "Continue processing based on tool results.", {
              model: tenantModelName,
              systemInstruction: systemPrompt,
              tools: finalTools
          });
          responseText = followUp.text;
          if (followUp.thinking) {
              logger.info({ userPhone: from, thinking: followUp.thinking }, '🧠 [Agentic Thought - FollowUp]');
          }
      }
  }

  if (aiResponse?.thinking) {
      logger.info({ userPhone: from, thinking: aiResponse.thinking }, '🧠 [Agentic Thought]');
  }

  let finalMessage = responseText.trim() || "Oga, try talk again.";
  
  // 🛡️ Skip PriceGuard during demo mode — AI is intentionally making up fake prices
  if (!isAdmin && !isStaff && !activeDemoNiche) {
      // --- DETERMINISTIC PRICE GUARD (PHASE 9.3) ---
      const priceGuard = new PriceGuard(ai);
      const guardResult = await priceGuard.validateResponse(finalMessage, businessKnowledge, currency);
      
      if (!guardResult.isSafe) {
          logger.error({ reason: guardResult.mismatchReason }, "🛑 [PRICE GUARD] Hallucination Blocked!");
          
          // Re-try once with correction instruction
          const correctionPrompt = `The previous response contained a price hallucination: ${guardResult.mismatchReason}\n\n${guardResult.suggestedCorrection}\n\nRegenerate the response with the CORRECT prices. Reply directly with the final message.`;
          try {
              const recovery = await ai.chat(normalizedHistory, correctionPrompt, {
                  model: tenantModelName,
                  systemInstruction: systemPrompt,
                  tools: tenantTools
              });
              
              const recoveryMessage = recovery.text;

              // Double-check the recovery response (The "Hard-Fail" check)
              const secondGuardCheck = await priceGuard.validateResponse(recoveryMessage, businessKnowledge, currency);
              
              if (secondGuardCheck.isSafe) {
                  finalMessage = recoveryMessage;
                  logger.info("✅ [PRICE GUARD] Response corrected and recovered safely.");
              } else {
                  logger.fatal({ reason: secondGuardCheck.mismatchReason }, "🔥 [PRICE GUARD] Recovery failed. Forcing Hard-Fail.");
                  finalMessage = `I'm sorry, I'm having trouble calculating the exact price right now. Please let me connect you with a human representative to confirm your order.`;
              }

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
