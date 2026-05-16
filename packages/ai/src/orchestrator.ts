import { AIProvider, AIMessage, AIOptions, AIResponse } from './index.js';

export interface OrchestratorOptions {
  primary: AIProvider;
  fallback?: AIProvider;
  fallbackModelOverride?: string;
}

export class AIOrchestrator implements AIProvider {
  name = 'orchestrator';
  private primary: AIProvider;
  private fallback?: AIProvider;
  private fallbackModelOverride?: string;

  constructor(options: OrchestratorOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.fallbackModelOverride = options.fallbackModelOverride;
  }

  private async tryWithFallback<T>(fn: (provider: AIProvider, options?: AIOptions) => Promise<T>, options?: AIOptions): Promise<T> {
    try {
      return await fn(this.primary, options);
    } catch (err: any) {
      if (this.fallback && (
          err.message?.includes('429') || 
          err.message?.includes('Quota') || 
          err.message?.includes('503') ||
          err.message?.includes('overloaded') ||
          err.message?.includes('RESOURCE_EXHAUSTED') ||
          err.status === 429
      )) {
        console.warn(`⚠️ Primary provider [${this.primary.name}] failed. Falling back to [${this.fallback.name}]...`);
        
        // Override model if fallback model string is provided, otherwise it will try to use the primary model string (e.g. 'gemini-3-flash') which might fail on DeepSeek
        const fallbackOptions = options ? { ...options } : undefined;
        if (fallbackOptions && this.fallbackModelOverride) {
            fallbackOptions.model = this.fallbackModelOverride;
        } else if (fallbackOptions && this.fallback.name === 'openai') {
            fallbackOptions.model = 'deepseek-chat'; // default to deepseek chat if no override
        } else if (fallbackOptions && this.fallback.name === 'gemini') {
             // If falling back to Gemini itself (e.g., using a different tier or just retrying), 
             // ensure we try a lighter model if the primary was heavy.
             if (fallbackOptions.model?.includes('gemini-3-flash')) {
                 fallbackOptions.model = 'gemini-2.5-flash';
             }
        }

        return await fn(this.fallback, fallbackOptions);
      }
      throw err;
    }
  }

  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    return this.tryWithFallback((p, opts) => p.generateText(prompt, opts), options);
  }

  async chat(history: AIMessage[], message: string | import('./index.js').AIMessagePart[], options?: AIOptions): Promise<AIResponse> {
    return this.tryWithFallback((p, opts) => p.chat(history, message, opts), options);
  }

  async analyzeImage(buffer: Buffer, mimeType: string, prompt: string, options?: AIOptions): Promise<AIResponse> {
    return this.tryWithFallback((p, opts) => p.analyzeImage(buffer, mimeType, prompt, opts), options);
  }
}
