import { AIProviderType } from './factory.js';

export type ModelSkill = 
    | 'reasoning' 
    | 'tool-calling' 
    | 'audio-in' 
    | 'vision-in' 
    | 'summarization'
    | 'data-processing';

export type CostProfile = 'ultra-low' | 'low' | 'medium' | 'high';

export interface ModelCapability {
    id: string;             // e.g. 'gemini-3-flash-preview', 'qwen-omni'
    provider: AIProviderType; 
    baseURL?: string;       // Used if provider is 'openai' (compatible mode)
    apiKeyEnv: string;      // The environment variable name to fetch the key (e.g. 'DASHSCOPE_KEY')
    skills: ModelSkill[];
    costProfile: CostProfile;
    maxContext: number;
}

export const GlobalModelRegistry: ModelCapability[] = [
    {
        id: 'models/gemini-3-flash-preview',
        provider: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com',
        apiKeyEnv: 'GEMINI_API_KEY_STUDIO',
        skills: ['reasoning', 'tool-calling', 'vision-in', 'audio-in', 'summarization'],
        costProfile: 'low',
        maxContext: 1000000
    },
    {
        id: 'models/gemini-3.1-pro-preview',
        provider: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com',
        apiKeyEnv: 'GEMINI_API_KEY_STUDIO',
        skills: ['reasoning', 'tool-calling', 'audio-in', 'summarization'],
        costProfile: 'medium',
        maxContext: 1000000
    },
    {
        id: 'models/gemini-3.1-flash-lite',
        provider: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com',
        apiKeyEnv: 'GEMINI_API_KEY_STUDIO',
        skills: ['reasoning', 'tool-calling', 'vision-in', 'audio-in', 'summarization'],
        costProfile: 'ultra-low',
        maxContext: 1000000
    },
    {
        id: 'qwen3-omni-flash-realtime',
        provider: 'openai',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKeyEnv: 'DASHSCOPE_KEY',
        skills: ['audio-in', 'reasoning'],
        costProfile: 'low',
        maxContext: 32000
    },
    {
        id: 'deepseek-v4-pro',
        provider: 'openai',
        baseURL: 'https://api.deepseek.com/v1',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        skills: ['reasoning', 'tool-calling', 'summarization', 'data-processing'],
        costProfile: 'high',
        maxContext: 1000000
    },
    {
        id: 'deepseek-v4-flash',
        provider: 'openai',
        baseURL: 'https://api.deepseek.com/v1',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        skills: ['reasoning', 'tool-calling', 'summarization', 'data-processing'],
        costProfile: 'ultra-low',
        maxContext: 1000000
    },
    {
        id: 'models/gemma-4-36b',
        provider: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com',
        apiKeyEnv: 'GEMINI_API_KEY_STUDIO',
        skills: ['reasoning', 'tool-calling', 'summarization'],
        costProfile: 'ultra-low',
        maxContext: 128000
    }
];
