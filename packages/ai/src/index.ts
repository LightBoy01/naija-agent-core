export interface AIMessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: any;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}

export interface AIMessage {
  role: 'user' | 'model' | 'system' | 'function';
  content?: string;
  parts: AIMessagePart[];
}

export interface AIOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: any;
}

export interface AIResponse {
  text: string;
  thinking?: string; 
  functionCalls?: any[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  name: string;
  generateText(prompt: string, options?: AIOptions): Promise<AIResponse>;
  chat(history: AIMessage[], message: string | AIMessagePart[], options?: AIOptions): Promise<AIResponse>;
  analyzeImage(buffer: Buffer, mimeType: string, prompt: string, options?: AIOptions): Promise<AIResponse>;
}

export * from './providers/gemini.js';
export * from './providers/openai.js';
export * from './providers/dashscope.js';
export * from './orchestrator.js';
export * from './factory.js';
