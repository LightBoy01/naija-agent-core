import OpenAI from 'openai';
import { AIProvider, AIMessage, AIOptions, AIResponse, AIMessagePart } from '../index.js';
import { SystemConfig } from '@naija-agent/types';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.openai.com/v1'
    });
  }

  /**
   * Translates Gemini-formatted tools to OpenAI-formatted tools.
   */
  private normalizeTools(geminiTools: any[]): any[] | undefined {
    if (!geminiTools || geminiTools.length === 0) return undefined;
    
    // Gemini tools are usually [{ functionDeclarations: [...] }]
    const declarations = geminiTools[0]?.functionDeclarations || [];
    if (declarations.length === 0) return undefined;

    return declarations.map((decl: any) => ({
      type: 'function',
      function: {
        name: decl.name,
        description: decl.description,
        parameters: decl.parameters
      }
    }));
  }

  private parseResponse(content: string): { text: string; thinking?: string } {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      const thinking = thinkMatch[1].trim();
      const text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      return { text, thinking };
    }
    return { text: content };
  }

  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4-turbo-preview',
      messages: [
        ...(options?.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] as any : []),
        { role: 'user', content: prompt }
      ],
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      response_format: options?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
    });

    const content = response.choices[0].message.content || "";
    const { text, thinking } = this.parseResponse(content);

    return {
      text,
      thinking,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    };
  }

  async chat(history: AIMessage[], message: string | AIMessagePart[], options?: AIOptions): Promise<AIResponse> {
    const messages: any[] = [];
    
    if (options?.systemInstruction) {
      messages.push({ role: 'system', content: options.systemInstruction });
    }

    // Convert history to OpenAI format
    for (const msg of history) {
      if (msg.role === 'function') {
        // Find the function result part
        const part = msg.parts.find(p => p.functionResponse);
        if (part) {
          messages.push({
            role: 'tool',
            tool_call_id: part.functionResponse!.name, // Note: OpenAI expects a real ID, but name works for simple mocks
            content: JSON.stringify(part.functionResponse!.response)
          });
        }
        continue;
      }

      const contentParts = msg.parts.map(p => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.inlineData) return { 
          type: 'image_url', 
          image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } 
        };
        return null;
      }).filter(Boolean);

      const openAIRole = msg.role === 'model' ? 'assistant' : 'user';
      
      // Handle tool calls from the assistant
      const toolCalls = msg.parts
        .filter(p => p.functionCall)
        .map(p => ({
          id: p.functionCall!.name,
          type: 'function',
          function: {
            name: p.functionCall!.name,
            arguments: JSON.stringify(p.functionCall!.args)
          }
        }));

      messages.push({
        role: openAIRole,
        content: contentParts.length > 0 ? (contentParts.length === 1 && contentParts[0]?.type === 'text' ? contentParts[0].text : contentParts) : undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      });
    }

    // Add current message
    const currentParts = typeof message === 'string' ? [{ type: 'text', text: message }] : (Array.isArray(message) ? message.map(p => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.inlineData) return { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } };
        return null;
    }).filter(Boolean) : []);

    messages.push({ role: 'user', content: currentParts });

    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4-turbo-preview',
      messages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      response_format: options?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined,
      tools: this.normalizeTools(options?.tools || [])
    });

    const content = response.choices[0].message.content || "";
    const { text, thinking } = this.parseResponse(content);

    return {
      text,
      thinking,
      functionCalls: response.choices[0].message.tool_calls?.map(tc => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments)
      })),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    };
  }

  async analyzeImage(buffer: Buffer, mimeType: string, prompt: string, options?: AIOptions): Promise<AIResponse> {
    const base64Image = buffer.toString('base64');
    
    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4-vision-preview',
      messages: [
        ...(options?.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] as any : []),
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: options?.maxTokens || 1000
    });

    const content = response.choices[0].message.content || "";
    const { text, thinking } = this.parseResponse(content);

    return {
      text,
      thinking,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    };
  }
}
