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
      name: 'web_search',
      description: 'Search the live internet for general knowledge, news, facts, and live information.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: { type: SchemaType.STRING, description: 'The search query (e.g. "Latest news in Nigeria today", "Who won the Champions League match yesterday?").' }
        },
        required: ['query']
      }
    },
    {
      name: 'generate_invite',
      description: 'Generate a referral invite link for the user to invite a friend. Explain the "Give 10, Get 10" energy bonus.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: 'The user\'s phone number (Phone ID).' }
        },
        required: ['userId']
      }
    },
    {
      name: 'delegate_task',
      description: 'Delegate a complex task or research request to a specialized sub-agent (Small Language Model). Use this when you need an expert to execute tools or analyze data on your behalf.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          sector: { type: SchemaType.STRING, description: 'The sector pack required. Must be one of: "EducationPack", "LifePack", "ResearchPack", or "CommercePack".' },
          instruction: { type: SchemaType.STRING, description: 'Clear, detailed instructions for the sub-agent on what exactly you need them to do or find out.' }
        },
        required: ['sector', 'instruction']
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
export async function executeLifeTool(name: string, args: Record<string, any>): Promise<any> {
  logger.info({ tool: name, args }, '🛠️ Executing Life Tool');

  try {
    switch (name) {
      case 'generate_quiz':
        return await studyBuddy.generateQuiz(args.subject, args.topic, args.level);

      case 'search_vault':
        return await searchVault(args.userId, args.query);

      case 'save_note':
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock-key';
        return await ingestNote(args.userId, args.note, apiKey);

      case 'delete_from_vault':
        return await deleteFromVault(args.userId, args.docId);

      case 'generate_invite':
        const botPhone = process.env.AELIXXR_PHONE_ID_DISPLAY || '2347042310893'; // Fallback to test number
        const encodedText = encodeURIComponent(`Hi Aelixxr! My friend ${args.userId} invited me. Let's chat!`);
        return { 
           status: 'success', 
           inviteLink: `https://wa.me/${botPhone}?text=${encodedText}`,
           instructions: 'Tell the user to share this link. When their friend sends the pre-filled message, both will receive 10 extra Energy Credits!'
        };

      case 'web_search': {
        try {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const searchGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '');
          
          const trySearch = async (modelName: string) => {
            const searchModel = searchGenAI.getGenerativeModel({ 
              model: modelName,
              tools: [{ googleSearch: {} }] as any
            });

            const searchResult = await searchModel.generateContent({
              contents: [{ role: 'user', parts: [{ text: `Search for: ${args.query}. Summarize the key facts, prices, or news found.` }] }]
            });
            
            return searchResult.response.text();
          };

          try {
            // Tier 1: Primary Gemma 4
            const summary = await trySearch("gemma-4-26b-a4b-it");
            return { status: 'success', result: summary };
          } catch (firstTryErr: any) {
             if (firstTryErr.message.includes('429') || firstTryErr.message.includes('503') || firstTryErr.message.includes('fetch failed') || firstTryErr.message.includes('500')) {
                logger.warn(`🔄 [LIFE SEARCH FALLBACK] Quota Exceeded or Model Busy. Retrying with Gemini 2.5 Flash...`);
                // Tier 2: 2.5 Flash (Reliability)
                const secondSummary = await trySearch("gemini-2.5-flash");
                return { status: 'success', result: secondSummary };
             }
             throw firstTryErr;
          }
        } catch (err: any) {
          logger.error({ error: err.message }, 'Web Search Failed');
          return { error: 'Oga, I don search tire for today! I don reach my limit for now.' };
        }
      }

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
