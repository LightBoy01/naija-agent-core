import { AIMessage, AIProvider } from '@naija-agent/ai';
import { logger } from '../utils/logger.js';
import { billingService } from '../services/billingService.js';
import { executeLifeTool } from '../tools/index.js';
import { redactPII } from '../utils/security.js';

export interface ToolExecutorInput {
  functionCalls: Array<{ name: string; args: Record<string, any> }>;
  ctx: {
    userPhone: string;
    phoneId?: string;
    energyCredits: number;
    message?: string;
    type?: string;
    isImage?: boolean;
    isDoc?: boolean;
    isAudio?: boolean;
  };
  ai: AIProvider;
  primaryModel: string;
  systemPrompt: string;
  chatId: string;
  jobId: string;
  normalizedHistory: AIMessage[];
  isCron?: boolean;
  isRslm?: boolean;
  rslmJwt?: string;
}

export interface ToolExecutorOutput {
  text: string | null;
  thinking?: string;
}

export async function executeToolCalls(input: ToolExecutorInput): Promise<ToolExecutorOutput> {
  const { functionCalls, ctx, ai, primaryModel, systemPrompt, chatId, jobId, normalizedHistory } = input;

  const toolHistory: AIMessage[] = [
    ...normalizedHistory,
    { role: 'user', parts: [{ text: ctx.message || "[Media]" }] },
    { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) }
  ];

  const toolResponses: any[] = [];
  let errorText: string | null = null;

  for (const call of functionCalls) {
    const billResult = await billingService.billForTool(ctx.userPhone, call.name, ctx.energyCredits, undefined, jobId);
    if (!billResult.success) {
      errorText = billResult.errorText || "Insufficient energy.";
      break;
    }

    const toolResult = await executeLifeTool(call.name, { ...call.args, userId: ctx.userPhone, sessionId: chatId }, jobId);

    if (toolResult && toolResult.error) {
      logger.error({ toolName: call.name, error: toolResult.error }, '🛠️ Tool Execution Returned Error. Triggering Refund.');
      await billingService.refundCredits(ctx.userPhone, billResult.costInCredits);
    }

    toolResponses.push({ functionResponse: { name: call.name, response: toolResult } });
  }

  if (errorText) {
    return { text: errorText };
  }

  if (toolResponses.length > 0) {
    const finalHistory = [...toolHistory, { role: 'function', parts: toolResponses }] as AIMessage[];
    const followUp = await ai.chat(finalHistory, "Continue based on tool results.", {
      model: primaryModel,
      systemInstruction: systemPrompt,
      tools: undefined
    });
    return { text: followUp.text, thinking: followUp.thinking };
  }

  return { text: null };
}

export function buildSafeUserMessage(ctx: ToolExecutorInput['ctx'], rawMessage?: string): string {
  const { message, type, isImage, isDoc, isAudio } = ctx;
  if (message) return redactPII(message);
  if (type === 'text') return '[Empty Message]';
  if (isImage) return '[Image]';
  if (isDoc) return '[Document]';
  if (isAudio) return '[Audio]';
  return `[${type?.toUpperCase() || 'UNKNOWN'}]`;
}
