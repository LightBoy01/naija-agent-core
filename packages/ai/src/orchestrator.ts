import { AIProvider, AIMessage, AIOptions, AIResponse } from './index.js';
import { ModelCapability, ModelSkill } from './registry.js';
import { AIFactory } from './factory.js';

export interface DynamicOrchestratorOptions {
  registry: ModelCapability[];
  fallbackModelOverride?: string;
}

export class AIOrchestrator implements AIProvider {
  name = 'dynamic-orchestrator';
  private registry: ModelCapability[];
  private fallbackModelOverride?: string;
  private providers: Map<string, AIProvider> = new Map();

  constructor(options: DynamicOrchestratorOptions) {
    this.registry = options.registry;
    this.fallbackModelOverride = options.fallbackModelOverride;
  }

  private getProviderForSkill(skill: ModelSkill, preferredCost: 'high' | 'medium' | 'low' | 'ultra-low' = 'low'): { provider: AIProvider, model: ModelCapability } {
      // 1. Filter models by skill
      const capableModels = this.registry.filter(m => m.skills.includes(skill));
      if (capableModels.length === 0) {
          throw new Error(`[CapabilityRouter] No models found with required skill: ${skill}`);
      }

      // 2. Sort by cost (roughly matching preferredCost)
      const costScores = { 'ultra-low': 1, 'low': 2, 'medium': 3, 'high': 4 };
      capableModels.sort((a, b) => costScores[a.costProfile] - costScores[b.costProfile]);
      
      // Use the cheapest capable model unless specifically requesting a high-cost one
      let selectedModel = capableModels[0];
      if (preferredCost === 'high') {
          selectedModel = capableModels[capableModels.length - 1]; // Use the most powerful
      }

      // 3. Lazy Load Provider Instance
      if (!this.providers.has(selectedModel.id)) {
          const apiKey = process.env[selectedModel.apiKeyEnv] || '';
          this.providers.set(selectedModel.id, AIFactory.createProvider({
              type: selectedModel.provider,
              apiKey: apiKey,
              baseURL: selectedModel.baseURL,
              model: selectedModel.id
          }));
      }

      return { provider: this.providers.get(selectedModel.id)!, model: selectedModel };
  }

  private async executeWithFailover<T>(
      skill: ModelSkill, 
      cost: 'high' | 'low', 
      preferredModel: string | undefined,
      fn: (provider: AIProvider, modelId: string) => Promise<T>
  ): Promise<T> {
      const capableModels = this.registry.filter(m => m.skills.includes(skill));
      if (capableModels.length === 0) throw new Error(`No models support ${skill}`);

      // Sort by cost
      const costScores = { 'ultra-low': 1, 'low': 2, 'medium': 3, 'high': 4 };
      capableModels.sort((a, b) => costScores[a.costProfile] - costScores[b.costProfile]);
      
      // Attempt models starting from the preferred target
      let targets = cost === 'high' ? [...capableModels].reverse() : capableModels;

      if (preferredModel) {
          const pref = targets.find(m => m.id === preferredModel);
          if (pref) {
              targets = [pref, ...targets.filter(m => m.id !== preferredModel)];
          }
      }

      let lastError: any = null;
      for (const target of targets) {
          try {
              if (!this.providers.has(target.id)) {
                  const apiKey = process.env[target.apiKeyEnv] || '';
                  if (!apiKey) {
                      console.warn(`[CapabilityRouter] Skipping ${target.id} due to missing API key (${target.apiKeyEnv})`);
                      continue;
                  }
                  this.providers.set(target.id, AIFactory.createProvider({
                      type: target.provider,
                      apiKey: apiKey,
                      baseURL: target.baseURL,
                      model: target.id
                  }));
              }
              
              const provider = this.providers.get(target.id)!;
              console.log(`[CapabilityRouter] Executing task via model: ${target.id}`);
              return await fn(provider, target.id);
          } catch (err: any) {
              lastError = err;
              if (
                  err.message?.includes('429') || 
                  err.message?.includes('Quota') || 
                  err.message?.includes('503') ||
                  err.message?.includes('overloaded') ||
                  err.message?.includes('RESOURCE_EXHAUSTED') ||
                  err.status === 429
              ) {
                  console.warn(`⚠️ Provider [${target.id}] failed: ${err.message}. Routing to next capability...`);
                  continue; // Try next model
              }
              throw err; // If it's a hard error (e.g., bad request), throw it
          }
      }
      throw lastError || new Error(`[CapabilityRouter] All capable models failed for skill: ${skill}`);
  }

  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    return this.executeWithFailover('reasoning', 'low', options?.model, (p, modelId) => p.generateText(prompt, { ...options, model: modelId }));
  }

  async chat(history: AIMessage[], message: string | import('./index.js').AIMessagePart[], options?: AIOptions): Promise<AIResponse> {
    // Dynamic Routing Detection
    let skill: ModelSkill = 'reasoning';
    let cost: 'high' | 'low' = 'low';

    if (options?.tools && options.tools.length > 0) {
        skill = 'tool-calling';
        cost = 'high'; // Tools demand high-tier models
    }
    
    // Check if message has audio parts
    if (typeof message !== 'string') {
        const hasAudio = message.some(part => part.inlineData?.mimeType.startsWith('audio/'));
        if (hasAudio) {
            skill = 'audio-in';
        }
        const hasVision = message.some(part => part.inlineData?.mimeType.startsWith('image/'));
        if (hasVision) {
            skill = 'vision-in';
        }
    }

    return this.executeWithFailover(skill, cost, options?.model, (p, modelId) => p.chat(history, message, { ...options, model: modelId }));
  }

  async analyzeImage(buffer: Buffer, mimeType: string, prompt: string, options?: AIOptions): Promise<AIResponse> {
    return this.executeWithFailover('vision-in', 'low', options?.model, (p, modelId) => p.analyzeImage(buffer, mimeType, prompt, { ...options, model: modelId }));
  }

  async embedText(text: string): Promise<number[]> {
    // Embeddings bypass the router — always use Gemini embeddings directly
    // to avoid confusing routing logs (gemini-3.1-flash-lite is NOT an embedding model)
    const embedModel = process.env.GEMINI_API_KEY_EMBEDDING || process.env.GEMINI_API_KEY_STUDIO;
    if (!this.providers.has('_embedding')) {
      const apiKey = process.env.GEMINI_API_KEY_STUDIO || process.env.GEMINI_API_KEY || '';
      this.providers.set('_embedding', AIFactory.createProvider({
        type: 'gemini',
        apiKey,
        baseURL: 'https://generativelanguage.googleapis.com',
        model: 'gemini-embedding-2'
      }));
    }
    const provider = this.providers.get('_embedding')!;
    return provider.embedText(text);
  }
}
