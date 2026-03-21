import { Tool, SchemaType } from '@google/generative-ai';
import { marketService } from './services/marketData.js';
import { studyBuddy } from './services/studyBuddy.js';
import { logger } from './utils/logger.js';

// --- Tool Definitions for Gemini ---
export const LIFE_TOOLS: Tool[] = [
  {
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
      // Future: verify_nafdac, check_jamb_result
    ],
  },
];

// --- Tool Execution Logic ---
export async function executeLifeTool(name: string, args: any): Promise<any> {
  logger.info({ tool: name, args }, '🛠️ Executing Life Tool');

  try {
    switch (name) {
      case 'get_market_prices':
        return await marketService.getPrices();
      
      case 'generate_quiz':
        return await studyBuddy.generateQuiz(args.subject, args.topic, args.level);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    logger.error({ tool: name, error: error.message }, '❌ Tool Execution Failed');
    return { error: error.message };
  }
}
