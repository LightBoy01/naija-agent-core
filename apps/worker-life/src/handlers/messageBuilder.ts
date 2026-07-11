import { AIProvider, AIMessage } from '@naija-agent/ai';
import { getChatHistory, findOrCreateChat } from '@naija-agent/database';
import { logger } from '../utils/logger.js';
import { promptService } from '../services/promptService.js';
import { LifePipelineContext } from '../pipeline/types.js';

export async function buildSystemPrompt(ai: AIProvider, ctx: LifePipelineContext): Promise<string> {
  let soulPrompt = promptService.getPrompt('Aelixxr.Soul.md');
  const masterBotPhone = process.env.MASTER_BOT_PHONE || '2348000000000';
  soulPrompt = soulPrompt
      .replace(/\[Master_Bot_Number\]/g, masterBotPhone)
      .replace(/<USER_PHONE_NUMBER>/g, ctx.userPhone);
      
  let semanticMemories = '';

  if (ctx.message) {
    try {
      const fullVector = await ai.embedText(ctx.message);
      const vector = fullVector.slice(0, 768);
      if (vector.length === 768) {
        const { lifeMemory } = await import('../services/lifeMemory.js');
        const memoryResults = await lifeMemory.searchSemanticMemory(ctx.userPhone, vector, 3);
        if (memoryResults && memoryResults.length > 0) {
          semanticMemories = `\n[LONG-TERM RECALL (Relevant to current context)]:\n${memoryResults.map(m => `- ${m.content}`).join('\n')}`;
          logger.info({ memories: memoryResults.map(m => m.content), userPhone: ctx.userPhone }, '🧠 Retrieved Semantic Memories');
        }
      }
    } catch (e: any) {
      logger.warn({ error: e.message }, 'Semantic memory retrieval skipped');
    }
  }

  return `
${soulPrompt}
${ctx.securitySummary}
${ctx.ingestionSummary}

---
[CONTEXT]:
- UNIX Timestamp: ${Date.now()}
- UTC: ${new Date().toISOString()}
- Local: ${ctx.localTime} (${ctx.timezone})
- Energy: ${ctx.energyCredits}
- Goals: ${JSON.stringify(ctx.lifeContext.goals || [])}
- Active Monitors: ${JSON.stringify(ctx.activeMonitors)}${semanticMemories}
---`;
}

export interface ChatInput {
  ctx: LifePipelineContext;
  ai: AIProvider;
  getDynamicModels: (systemInstruction?: string) => Promise<any>;
}

export interface ChatResult {
  text: string;
  functionCalls?: any[];
  thinking?: string;
}

export async function chatWithAelixxr(input: ChatInput, systemPrompt: string): Promise<{ result: ChatResult; chatId: string; primaryModel: string; normalizedHistory: AIMessage[] }> {
  const { ctx, ai, getDynamicModels } = input;
  const chatId = await findOrCreateChat(ctx.orgId || 'naija_agent_hq', `${ctx.userPhone}_life`, 'User');
  const history = await getChatHistory(chatId, 10);

  const normalizedHistory: AIMessage[] = history.map((m: any) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const { primaryModel, tools } = await getDynamicModels(systemPrompt);

  let result: ChatResult;
  if (ctx.mediaBuffer && ctx.mediaMime) {
    if (ctx.mediaMime.startsWith('audio/')) {
      const res = await ai.chat(normalizedHistory, [
        { text: ctx.message || "Transcribe this audio" },
        { inlineData: { data: ctx.mediaBuffer.toString('base64'), mimeType: ctx.mediaMime } }
      ], { model: primaryModel, systemInstruction: systemPrompt, tools });
      result = { text: res.text, functionCalls: res.functionCalls, thinking: res.thinking };
    } else {
      const res = await ai.chat(normalizedHistory, [
        { text: ctx.message || "Analyze this image in the context of our conversation." },
        { inlineData: { data: ctx.mediaBuffer.toString('base64'), mimeType: ctx.mediaMime } }
      ], { model: primaryModel, systemInstruction: systemPrompt, tools });
      result = { text: res.text, functionCalls: res.functionCalls, thinking: res.thinking };
    }
  } else {
    const res = await ai.chat(normalizedHistory, ctx.message || "", {
      model: primaryModel, systemInstruction: systemPrompt, tools
    });
    result = { text: res.text, functionCalls: res.functionCalls, thinking: res.thinking };
  }

  return { result, chatId, primaryModel, normalizedHistory };
}
