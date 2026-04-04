import pino from 'pino';

const logger = pino({ name: 'json-utils' });

/**
 * Safely parses a JSON string, handling potential markdown code blocks
 * often returned by LLMs (e.g., ```json ... ```).
 */
export function safeParseJSON<T>(text: string): T | null {
  try {
    // 1. Strip Markdown Code Blocks
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 2. Attempt Parse
    return JSON.parse(cleanText) as T;
  } catch (error: any) {
    logger.error({ text, error: error.message }, '❌ JSON Parse Failed');
    return null;
  }
}
