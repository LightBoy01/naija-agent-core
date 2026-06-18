import { saveMessage } from '@naija-agent/database';
import { whatsappService } from '../services/whatsapp.js';
import { billingService } from '../services/billingService.js';
import { Formatter } from '../utils/formatter.js';
import { logger } from '../utils/logger.js';

export interface ResponseSenderInput {
  userPhone: string;
  phoneId?: string;
  text: string;
  chatId: string;
  ctxType?: string;
  safeUserMessage: string;
  thinking?: string;
  resultThinking?: string;
}

export async function sendResponse(input: ResponseSenderInput): Promise<void> {
  const { userPhone, phoneId, text, chatId, ctxType, safeUserMessage, thinking, resultThinking } = input;

  await billingService.billForMessage(userPhone);
  await whatsappService.sendText(userPhone, Formatter.format(text), phoneId);

  await saveMessage(chatId, { role: 'user', content: safeUserMessage, type: ctxType as any });

  const assistantMsg: any = { role: 'assistant', content: text, type: 'text' };
  if (resultThinking) assistantMsg.reasoning = resultThinking;
  await saveMessage(chatId, assistantMsg);

  if (thinking) {
    logger.info({ userPhone, thinking }, '🧠 [Agentic Thought - FollowUp]');
  }
}
