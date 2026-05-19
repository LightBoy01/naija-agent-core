import { AIProvider, GeminiProvider, OpenAIProvider, DashScopeProvider, AIOrchestrator } from './index.js';

export type AIProviderType = 'gemini' | 'openai' | 'commandcode' | 'dashscope';

export interface ProviderConfig {
  type: AIProviderType;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class AIFactory {
  static createProvider(config: ProviderConfig): AIProvider {
    if (!config.apiKey || config.apiKey === 'mock-key' || config.apiKey.trim() === '') {
      throw new Error(`[ConfigurationError] Missing valid API key for provider: ${config.type}. Halting execution to prevent unauthorized API calls.`);
    }

    switch (config.type) {
      case 'gemini':
        return new GeminiProvider(config.apiKey);
      case 'openai':
        return new OpenAIProvider(config.apiKey, config.baseURL);
      case 'dashscope':
        return new DashScopeProvider(config.apiKey, config.baseURL);
      case 'commandcode':
        return new OpenAIProvider(config.apiKey, config.baseURL || 'https://api.commandcode.ai/v1');
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }

  static createOrchestrator(primary: ProviderConfig, fallback?: ProviderConfig): AIOrchestrator {
    const primaryProvider = this.createProvider(primary);
    
    let fallbackProvider;
    try {
      fallbackProvider = fallback && fallback.apiKey && fallback.apiKey !== 'mock-key' 
        ? this.createProvider(fallback) 
        : undefined;
    } catch (e) {
      console.warn(`⚠️ Fallback provider failed to initialize: ${(e as Error).message}`);
    }

    return new AIOrchestrator({
      primary: primaryProvider,
      fallback: fallbackProvider,
      fallbackModelOverride: fallback?.model
    });
  }
}
