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

  private convertSchemaTypes(schema: any): any {
    if (!schema) return schema;
    
    const result = { ...schema };
    
    if (typeof result.type === 'string') {
        const typeMap: Record<string, string> = {
            'STRING': 'string',
            'NUMBER': 'number',
            'INTEGER': 'integer',
            'BOOLEAN': 'boolean',
            'ARRAY': 'array',
            'OBJECT': 'object'
        };
        result.type = typeMap[result.type.toUpperCase()] || result.type.toLowerCase();
    }
    
    if (result.properties) {
        for (const key in result.properties) {
            result.properties[key] = this.convertSchemaTypes(result.properties[key]);
        }
    }
    
    if (result.items) {
        result.items = this.convertSchemaTypes(result.items);
    }
    
    return result;
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
        parameters: this.convertSchemaTypes(decl.parameters)
      }
    }));
  }

  private parseResponse(content: string): { text: string; thinking?: string; dsmlFunctionCalls?: any[] } {
    let text = content;
    let thinking: string | undefined = undefined;
    let dsmlFunctionCalls: any[] = [];

    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinking = thinkMatch[1].trim();
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    // Parse DSML tool calls
    const dsmlMatch = text.match(/<｜｜DSML｜｜tool_calls>([\s\S]*?)<\/｜｜DSML｜｜tool_calls>/);
    if (dsmlMatch) {
        const dsmlContent = dsmlMatch[1];
        const invokeRegex = /<｜｜DSML｜｜invoke name="([^"]+)">([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;
        let invokeMatch;
        while ((invokeMatch = invokeRegex.exec(dsmlContent)) !== null) {
            const name = invokeMatch[1];
            const paramsContent = invokeMatch[2];
            const args: any = {};
            
            const paramRegex = /<｜｜DSML｜｜parameter name="([^"]+)"[^>]*>([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
            let paramMatch;
            while ((paramMatch = paramRegex.exec(paramsContent)) !== null) {
                const paramName = paramMatch[1];
                let paramVal = paramMatch[2].trim();
                try {
                    // Parse as JSON if possible (for numbers, booleans, arrays)
                    paramVal = JSON.parse(paramVal);
                } catch {
                    // Keep as string if it's plain text
                }
                args[paramName] = paramVal;
            }
            dsmlFunctionCalls.push({ name, args });
        }
        text = text.replace(/<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>/g, '').trim();
    }

    return { text, thinking, dsmlFunctionCalls: dsmlFunctionCalls.length > 0 ? dsmlFunctionCalls : undefined };
  }

  async generateText(prompt: string, options?: AIOptions): Promise<AIResponse> {
    let sysInstr = options?.systemInstruction;
    if (options?.responseSchema) {
        const schemaText = `\n\nCRITICAL: You MUST output your response as a valid JSON object strictly adhering to this schema:\n${JSON.stringify(options.responseSchema, null, 2)}`;
        sysInstr = sysInstr ? sysInstr + schemaText : schemaText;
    }

    const response = await this.client.chat.completions.create({
      model: options?.model || 'gpt-4-turbo-preview',
      messages: [
        ...(sysInstr ? [{ role: 'system', content: sysInstr }] as any : []),
        { role: 'user', content: prompt }
      ],
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      response_format: options?.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
    });

    const content = response.choices[0].message.content || "";
    const { text, thinking, dsmlFunctionCalls } = this.parseResponse(content);

    let functionCalls: any[] | undefined = undefined;
    if (dsmlFunctionCalls && dsmlFunctionCalls.length > 0) {
        functionCalls = dsmlFunctionCalls;
    }

    return {
      text,
      thinking,
      functionCalls,
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
      let sysInstr = options.systemInstruction;
      if (options.responseSchema) {
          sysInstr += `\n\nCRITICAL: You MUST output your response as a valid JSON object strictly adhering to this schema:\n${JSON.stringify(options.responseSchema, null, 2)}`;
      }
      messages.push({ role: 'system', content: sysInstr });
    } else if (options?.responseSchema) {
      messages.push({ role: 'system', content: `CRITICAL: You MUST output your response as a valid JSON object strictly adhering to this schema:\n${JSON.stringify(options.responseSchema, null, 2)}` });
    }

    // Convert history to OpenAI format
    for (const msg of history) {
      if (msg.role === 'function') {
        // Handle ALL function response parts (for multi-tool calls)
        const responseParts = msg.parts.filter(p => p.functionResponse);
        responseParts.forEach((part, idx) => {
          messages.push({
            role: 'tool',
            tool_call_id: `${part.functionResponse!.name}_${idx}`,
            content: JSON.stringify(part.functionResponse!.response)
          });
        });
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

      const openAIRole = (msg.role === 'model' || (msg.role as string) === 'assistant') ? 'assistant' : 'user';
      
      // Handle tool calls from the assistant — ensure unique IDs via index
      const toolCalls = msg.parts
        .filter(p => p.functionCall)
        .map((p, idx) => ({
          id: `${p.functionCall!.name}_${idx}`,
          type: 'function',
          function: {
            name: p.functionCall!.name,
            arguments: JSON.stringify(p.functionCall!.args)
          }
        }));

      messages.push({
        role: openAIRole,
        content: contentParts.length > 0 ? (contentParts.length === 1 && contentParts[0]?.type === 'text' ? contentParts[0].text : contentParts) : "",
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
    const { text, thinking, dsmlFunctionCalls } = this.parseResponse(content);

    let functionCalls = response.choices[0].message.tool_calls?.map((tc: any) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments)
    }));

    if (dsmlFunctionCalls && dsmlFunctionCalls.length > 0) {
        functionCalls = (functionCalls || []).concat(dsmlFunctionCalls);
    }

    return {
      text,
      thinking,
      functionCalls: functionCalls?.length ? functionCalls : undefined,
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
  async embedText(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });
    return response.data[0].embedding;
  }
}
