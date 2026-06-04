import { AIProvider, GeminiProvider, OpenAIProvider, DashScopeProvider, AIOrchestrator } from './index.js';
import { ModelCapability, GlobalModelRegistry } from './registry.js';

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
        return new GeminiProvider(config.apiKey, config.baseURL);
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

  // Deprecated: Kept for backwards compatibility until all apps migrate
  static createOrchestrator(primary: ProviderConfig, fallback?: ProviderConfig): AIOrchestrator {
    // Wrap the old inputs into a temporary registry so it still works under the new architecture
    const tempRegistry: ModelCapability[] = [
        {
            id: primary.model || 'primary-model',
            provider: primary.type,
            baseURL: primary.baseURL,
            apiKeyEnv: 'TEMP_PRIMARY_KEY',
            skills: ['reasoning', 'tool-calling', 'audio-in', 'vision-in', 'summarization', 'data-processing'],
            costProfile: 'high',
            maxContext: 1000000
        }
    ];

    if (fallback) {
        tempRegistry.push({
            id: fallback.model || 'fallback-model',
            provider: fallback.type,
            baseURL: fallback.baseURL,
            apiKeyEnv: 'TEMP_FALLBACK_KEY',
            skills: ['reasoning', 'tool-calling', 'summarization'],
            costProfile: 'low',
            maxContext: 32000
        });
        process.env['TEMP_FALLBACK_KEY'] = fallback.apiKey;
    }
    process.env['TEMP_PRIMARY_KEY'] = primary.apiKey;

    return new AIOrchestrator({ registry: tempRegistry, fallbackModelOverride: fallback?.model });
  }

  static createRouter(registry: ModelCapability[] = GlobalModelRegistry): AIOrchestrator {
      return new AIOrchestrator({ registry });
  }
}
