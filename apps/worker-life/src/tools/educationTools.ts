import { Type } from '@google/genai';
import { studyBuddy } from '../services/studyBuddy.js';

export const EDUCATION_TOOLS = [
    {
      name: 'generate_quiz',
      description: 'Generate a study quiz for a student. Requires subject and topic.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, description: 'The subject (e.g. Mathematics, English, Biology)' },
          topic: { type: Type.STRING, description: 'The specific topic (e.g. Algebra, Oral English, Photosynthesis)' },
          level: { type: Type.STRING, description: 'The level (e.g. SS3, WAEC, JAMB, 100 Level)' }
        },
        required: ['subject', 'topic']
      }
    },
    {
      name: 'invite_coursemate',
      description: 'Invite a classmate or friend to use Aelixxr. You earn 50 Energy Credits if they join!',
      parameters: {
        type: Type.OBJECT,
        properties: {
          friendPhone: { type: Type.STRING, description: 'The phone number of the friend to invite (E.164 format).' }
        },
        required: ['friendPhone']
      }
    },
    {
      name: 'summarize_material',
      description: 'Summarize study notes, textbook pages, or lectures into simplified key points.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING, description: 'The raw text content to summarize. (NOTE: If summarizing a file, use get_vault_file FIRST to read the text, then pass the text here).' },
          format: { type: Type.STRING, enum: ['bullets', 'detailed', 'flashcards'], description: 'The desired summary format.' }
        },
        required: ['content']
      }
    }
];

export async function executeEducationTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    const { userId } = args;

    switch (name) {
      case 'generate_quiz':
        return await studyBuddy.generateQuiz(args.subject, args.topic, args.level);
      
      case 'invite_coursemate':
        const { lifeMemory } = await import('../services/lifeMemory.js');
        const inviteResult = await lifeMemory.createReferral(userId, args.friendPhone);
        return { 
          success: !!inviteResult, 
          message: `Referral link generated! If ${args.friendPhone} starts a chat, you'll receive your 50 Energy Credits instantly.` 
        };

      case 'summarize_material':
        const summary = await studyBuddy.summarizeMaterial(args.content, args.format);
        return { 
          success: true, 
          summary
        };

      default:
        throw new Error('Unknown Education tool: ' + name);
    }
}
