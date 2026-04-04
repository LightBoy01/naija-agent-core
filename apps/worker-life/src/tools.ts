import { Tool, SchemaType } from '@google/generative-ai';
import { marketService } from './services/marketData.js';
import { studyBuddy } from './services/studyBuddy.js';
import { logger } from './utils/logger.js';
import { searchVault, ingestNote, deleteFromVault } from '@naija-agent/storage';
import { mcpClient } from './services/mcpClient.js';
import { heartbeatService } from './services/heartbeat.js';

// --- Tool Definitions for Gemini ---
export const STATIC_LIFE_TOOLS: Tool = {
  functionDeclarations: [
    {
      name: 'get_market_prices',
      description: 'Get current food prices in Nigerian markets (Rice, Beans, Yam, etc.) to help users find the best deals.',
    },
    {
      name: 'generate_quiz',
      description: 'Generate a study quiz for a student. Requires subject and topic.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          subject: { type: SchemaType.STRING, description: 'The subject (e.g. Mathematics, English, Biology)' },
          topic: { type: SchemaType.STRING, description: 'The specific topic (e.g. Algebra, Oral English, Photosynthesis)' },
          level: { type: SchemaType.STRING, description: 'The level (e.g. SS3, WAEC, JAMB, 100 Level)' }
        },
        required: ['subject', 'topic']
      }
    },
    {
      name: 'search_vault',
      description: 'Search the user\'s personal document vault for receipts, bank alerts, contracts, or saved notes.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: 'The search term (e.g. "GTBank", "School Fees", "Rent").' },
          userId: { type: SchemaType.STRING, description: 'The user\'s phone number (Phone ID).' }
        },
        required: ['query', 'userId']
      }
    },
    {
      name: 'save_note',
      description: 'Save a text-based memory or note to the Vault. Use this when the user says "Remember this", "Save this note", or tells you a fact they want to recall later.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          note: { type: SchemaType.STRING, description: 'The text content to save (e.g. "Gate code is 1234", "Auntie Tope\'s birthday is Oct 5").' },
          userId: { type: SchemaType.STRING, description: 'The user\'s phone number (Phone ID).' }
        },
        required: ['note', 'userId']
      }
    },
    {
      name: 'delete_from_vault',
      description: 'Delete a document or note from the Vault using its ID.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          docId: { type: SchemaType.STRING, description: 'The unique ID of the document/note to delete.' },
          userId: { type: SchemaType.STRING, description: 'The user\'s phone number (Phone ID).' }
        },
        required: ['docId', 'userId']
      }
    },
    {
      name: 'create_heartbeat',
      description: 'Create a proactive monitor or reminder. Use this when the user asks you to "remind me", "alert me if", or "check every morning".',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING, description: 'The type of monitor (e.g. "market", "reminder", "custom").' },
          query: { type: SchemaType.STRING, description: 'What to monitor or remind about (e.g. "Price of Rice drops below 50k", "Call mum").' },
          intervalDescription: { type: SchemaType.STRING, description: 'How often to check (e.g. "every morning", "every 2 hours", "daily at 5pm").' },
          userId: { type: SchemaType.STRING, description: 'The user\'s phone number (Phone ID).' }
        },
        required: ['type', 'query', 'intervalDescription', 'userId']
      }
    },
    {
      name: 'delete_heartbeat',
      description: 'Delete an active proactive monitor or reminder.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          configId: { type: SchemaType.STRING, description: 'The unique ID of the heartbeat config.' },
          userId: { type: SchemaType.STRING, description: 'The user\'s phone number (Phone ID).' }
        },
        required: ['configId', 'userId']
      }
    }
  ],
};

export const LIFE_TOOLS: Tool[] = [STATIC_LIFE_TOOLS];

export async function getLifeTools(): Promise<Tool[]> {
  const tools = [STATIC_LIFE_TOOLS];
  
  try {
    const mcpTools = await mcpClient.getGeminiTools();
    if (mcpTools && mcpTools.length > 0) {
      tools.push({ functionDeclarations: mcpTools });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to append MCP tools');
  }

  return tools;
}

// --- Tool Execution Logic ---
export async function executeLifeTool(name: string, args: any): Promise<any> {
  logger.info({ tool: name, args }, '🛠️ Executing Life Tool');

  try {
    switch (name) {
      case 'get_market_prices':
        return await marketService.getPrices();
      
      case 'generate_quiz':
        return await studyBuddy.generateQuiz(args.subject, args.topic, args.level);

      case 'search_vault':
        return await searchVault(args.userId, args.query);

      case 'save_note':
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock-key';
        return await ingestNote(args.userId, args.note, apiKey);

      case 'delete_from_vault':
        return await deleteFromVault(args.userId, args.docId);

      case 'create_heartbeat':
        return await heartbeatService.createHeartbeat(args.userId, args.type, args.query, args.intervalDescription);

      case 'delete_heartbeat':
        return await heartbeatService.deleteHeartbeat(args.userId, args.configId);

      default:
        // Try fallback to MCP dynamically loaded tools
        logger.info({ tool: name }, 'Tool not found locally, attempting MCP execution');
        return await mcpClient.executeTool(name, args);
    }
  } catch (error: any) {
    logger.error({ tool: name, error: error.message }, '❌ Tool Execution Failed');
    return { error: error.message };
  }
}
