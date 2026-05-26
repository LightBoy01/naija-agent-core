import { GoogleGenAI } from '@google/genai';
import { AIProvider, AIMessage, AIOptions, AIResponse, AIMessagePart } from '../index.js';
import { SystemConfig } from '@naija-agent/types';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private genAI: GoogleGenAI;

  constructor(apiKey: string) {
    if (typeof process !== 'undefined' && process.platform === 'android' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    this.genAI = new GoogleGenAI({
      apiKey,
      httpOptions: { 
        baseUrl: 'https://aiplatform.googleapis.com', 
        apiVersion: 'v1/publishers/google' 
      }
    });
  }

  private normalizeHistory(history: AIMessage[]) {
    // 1. Map roles
    let chatHistory = history.map(msg => ({
      role: msg.role === 'model' || msg.role === 'system' ? 'model' : 'user',
      parts: msg.parts.map(p => {
          if (p.functionResponse) {
              return { functionResponse: p.functionResponse };
          }
          if (p.functionCall) {
              return { functionCall: p.functionCall };
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

  private extractText(result: any): string {
    if (!result) return "";
    try {
      if (result.functionCalls && result.functionCalls.length > 0) {
        if (result.candidates?.[0]?.content?.parts) {
          const textParts = result.candidates[0].content.parts.filter((p: any) => p.text);
          if (textParts.length > 0) return textParts.map((p: any) => p.text).join("");
        }
        return "";
      }
      return result.text || "";
    } catch (e) {
      return "";
    }
  }

  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    const modelName = options?.model || SystemConfig.MODELS.DEFAULT;
    
    const result = await this.genAI.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            systemInstruction: options?.systemInstruction,
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

    const chatSession = this.genAI.chats.create({
      model: modelName,
      config: {
        systemInstruction: options?.systemInstruction,
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
