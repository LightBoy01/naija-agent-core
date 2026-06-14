import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIMessage, AIOptions, AIResponse, AIMessagePart } from '../index.js';
import { SystemConfig } from '@naija-agent/types';
import crypto from 'crypto';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private genAI: GoogleGenAI;
  
  // Static cache to hold active context cache names across instances
  private static activeCaches: Record<string, { name: string, expiresAt: number }> = {};

  constructor(apiKey: string, baseURL?: string) {
    if (typeof process !== 'undefined' && process.platform === 'android' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    let defaultBaseURL = 'https://aiplatform.googleapis.com';
    if (apiKey && apiKey.startsWith('AIza')) {
      defaultBaseURL = 'https://generativelanguage.googleapis.com';
    }
    const resolvedBaseURL = baseURL || defaultBaseURL;
    const resolvedApiVersion = resolvedBaseURL.includes('generativelanguage') ? 'v1beta' : 'v1/publishers/google';
    const isVertexAI = !resolvedBaseURL.includes('generativelanguage');

    this.genAI = new GoogleGenAI({
      apiKey,
      vertexai: isVertexAI,
      apiVersion: resolvedApiVersion,
      httpOptions: { 
        baseUrl: resolvedBaseURL
      }
    });
  }

  // --- CACHING LOGIC ---
  private getInstructionHash(instruction?: string): string | null {
      if (!instruction || instruction.length < 5000) return null; // Only cache large prompts (~1000+ tokens)
      return crypto.createHash('sha256').update(instruction).digest('hex');
  }

  private async getOrCreateCache(modelName: string, systemInstruction: string): Promise<string | null> {
      if (modelName.toLowerCase().includes('gemma')) {
          return null; // Gemma models on GenAI v1beta do not support context caching
      }
      const hash = this.getInstructionHash(systemInstruction);
      if (!hash) return null;

      // 1. Check if we have a valid, unexpired cache
      const existing = GeminiProvider.activeCaches[hash];
      const now = Date.now();
      if (existing && existing.expiresAt > now + 60000) { // 1 min buffer
          return existing.name;
      }

      // 2. We need a specific model version for caching (e.g. models/gemini-1.5-flash-001)
      // If using a generic alias, we append -001 as a best-effort.
      // In 2026, most models support caching, but specific versioning is required.
      let versionedModel = modelName;
      if (!versionedModel.startsWith('models/')) {
          versionedModel = `models/${versionedModel}`;
      }


      try {
          console.log(`[GEMINI] Creating Context Cache for hash ${hash.substring(0,8)} using ${versionedModel}...`);
          const cache = await this.genAI.caches.create({
              model: versionedModel,
              config: {
                  systemInstruction: systemInstruction,
                  contents: [{ role: 'user', parts: [{ text: "Initialize Context" }] }], 
                  ttl: '3600s' 
              }
          });
          
          GeminiProvider.activeCaches[hash] = {
              name: cache.name as string,
              expiresAt: now + (3600 * 1000)
          };
          return cache.name as string;
      } catch (error: any) {
          // If the versioned model failed, try one more time with the raw model name if it's not already versioned
          if (!modelName.includes('-00') && (error.message.includes('not found') || error.message.includes('not supported'))) {
              try {
                  const retryCache = await this.genAI.caches.create({
                      model: modelName,
                      config: {
                          systemInstruction: systemInstruction,
                          contents: [{ role: 'user', parts: [{ text: "Initialize Context" }] }],
                          ttl: '3600s'
                      }
                  });
                  GeminiProvider.activeCaches[hash] = {
                      name: retryCache.name as string,
                      expiresAt: now + (3600 * 1000)
                  };
                  return retryCache.name as string;
              } catch (retryError) {
                  // Both failed, proceed without cache
              }
          }
          console.warn(`⚠️ [GEMINI] Context Caching failed: ${error.message}. Proceeding without cache.`);
          return null; 
      }
  }

  private normalizeHistory(history: AIMessage[]) {
    // 1. Map roles
    let chatHistory = history.map(msg => ({
      role: (msg.role === 'model' || msg.role === 'system' || (msg.role as string) === 'assistant') ? 'model' : 'user',
      parts: msg.parts.map(p => {
          if (p.functionResponse) {
              return { functionResponse: p.functionResponse };
          }
          if (p.functionCall) {
              // The Universal SDK (@google/genai) rejects the 'id' field. Strip it out.
              const cleanCall = { ...p.functionCall };
              if ('id' in cleanCall) delete (cleanCall as any).id;
              return { functionCall: cleanCall };
          }
          if (p.inlineData) {
              return { inlineData: p.inlineData };
          }
          return { text: p.text || "" };
      })
    }));

    // 2. Remove leading model messages
    while (chatHistory.length > 0 && chatHistory[0].role === 'model') {
      chatHistory.shift();
    }

    // 3. Ensure alternating roles and merge consecutive TEXT parts
    const alternatingHistory: any[] = [];
    let lastRole: string | null = null;

    for (const msg of chatHistory) {
      if (msg.role !== lastRole) {
        alternatingHistory.push(msg);
        lastRole = msg.role;
      } else {
        if (alternatingHistory.length > 0) {
          const lastMsg = alternatingHistory[alternatingHistory.length - 1];
          // Only merge if both have text parts. If one has functionCall/Response, don't merge.
          const hasFunctionParts = msg.parts.some(p => p.functionCall || p.functionResponse);
          if (!hasFunctionParts) {
              lastMsg.parts.push(...msg.parts);
          } else {
              // Forced role alternation for function calls if they occur consecutively
              alternatingHistory.push(msg);
          }
        }
      }
    }

    return alternatingHistory;
  }

  private stripThinkTags(text: string): string {
    if (!text) return "";
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  private extractText(result: any): string {
    if (!result) return "";
    let extracted = "";
    try {
      if (result.functionCalls && result.functionCalls.length > 0) {
        if (result.candidates?.[0]?.content?.parts) {
          const textParts = result.candidates[0].content.parts.filter((p: any) => p.text);
          if (textParts.length > 0) extracted = textParts.map((p: any) => p.text).join("");
        }
      } else {
        extracted = result.text || "";
      }
      return this.stripThinkTags(extracted);
    } catch (e) {
      return "";
    }
  }

  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    const modelName = options?.model || SystemConfig.MODELS.DEFAULT;
    
    // Attempt to use Context Caching for large instructions
    let cachedContent: string | null = null;
    if (options?.systemInstruction) {
        cachedContent = await this.getOrCreateCache(modelName, options.systemInstruction);
    }

    const result = await this.genAI.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            // If we have a cache, use it. SystemInstruction is already inside the cache.
            cachedContent: cachedContent || undefined,
            systemInstruction: cachedContent ? undefined : options?.systemInstruction,
            temperature: options?.temperature,
            maxOutputTokens: options?.maxTokens,
            responseMimeType: options?.responseMimeType,
            responseSchema: options?.responseSchema
        }
    });
    
    return {
      text: this.extractText(result),
      functionCalls: result.functionCalls
    };
  }

  async chat(history: AIMessage[], message: string | AIMessagePart[], options?: AIOptions): Promise<AIResponse> {
    const chatHistory = this.normalizeHistory(history);
    const modelName = options?.model || SystemConfig.MODELS.DEFAULT;

    // Attempt to use Context Caching for large instructions
    let cachedContent: string | null = null;
    if (options?.systemInstruction) {
        cachedContent = await this.getOrCreateCache(modelName, options.systemInstruction);
    }

    const chatSession = this.genAI.chats.create({
      model: modelName,
      config: {
        cachedContent: cachedContent || undefined,
        systemInstruction: cachedContent ? undefined : options?.systemInstruction,
        tools: options?.tools,
        responseMimeType: options?.responseMimeType,
        responseSchema: options?.responseSchema
      },
      history: chatHistory
    });

    // Prepare current message parts
    const parts = typeof message === 'string' ? [{ text: message }] : (Array.isArray(message) ? message : [message]);

    const result = await chatSession.sendMessage({ message: parts as any });
    
    return {
      text: this.extractText(result),
      functionCalls: result.functionCalls
    };
  }

  async analyzeImage(buffer: Buffer, mimeType: string, prompt: string, options?: AIOptions): Promise<AIResponse> {
    const modelName = options?.model || SystemConfig.MODELS.DEFAULT;
    
    const result = await this.genAI.models.generateContent({
        model: modelName,
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                { inlineData: { data: buffer.toString('base64'), mimeType } }
            ]
        }],
        config: {
            systemInstruction: options?.systemInstruction,
            tools: options?.tools,
            responseMimeType: options?.responseMimeType,
            responseSchema: options?.responseSchema
        }
    });

    return {
      text: this.extractText(result),
      functionCalls: result.functionCalls
    };
  }

  async embedText(text: string): Promise<number[]> {
    try {
        const embedKey = process.env.GEMINI_API_KEY_EMBEDDING || (this.genAI as any).apiClient.clientOptions.apiKey;
        // Use v1beta for gemini-embedding-2 availability
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${embedKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: { parts: [{ text }] }
            })
        });
        const result = await response.json() as any;
        const fullVector = result.embedding?.values || [];
        // Matryoshka Representation Learning: Truncate to 768 while keeping 99% accuracy
        return fullVector.slice(0, 768);
    } catch (e) {
        console.error('❌ Embedding fetch failed:', e);
        return [];
    }
  }
}
