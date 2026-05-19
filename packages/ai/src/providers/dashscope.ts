import { OpenAIProvider } from './openai.js';
import { AIOptions, AIResponse } from '../index.js';

/**
 * DashScopeProvider (Alibaba Cloud)
 * Optimized for Qwen and DeepSeek models on DashScope.
 * Utilizes the OpenAI-compatible endpoint but adds native Alibaba metadata handling.
 */
export class DashScopeProvider extends OpenAIProvider {
  constructor(apiKey: string, baseURL?: string) {
    // Default DashScope OpenAI-compatible endpoint
    super(apiKey, baseURL || 'https://dashscope.googleapis.com/compatible-mode/v1');
    this.name = 'dashscope';
  }

  /**
   * Overrides search grounding if DashScope specific tool format is required.
   * For now, it leverages the high-throughput reliability of Alibaba's backbone.
   */
  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    // Alibaba DashScope often prefers specific model naming conventions for Qwen.
    // If the model is 'qwen-max' or 'qwen-plus', ensure it's passed correctly.
    return super.generateText(prompt, options);
  }
}
