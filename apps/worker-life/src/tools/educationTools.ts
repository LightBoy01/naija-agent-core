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
    },
    {
      name: 'grep_vault',
      description: "Search the user's study vault for exact quotes or concepts using high-speed semantic search. Use this to answer specific questions based on their uploaded lecture slides or notes.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The search query or concept to look for.' },
          limit: { type: Type.INTEGER, description: 'Number of results to return (default 3).' }
        },
        required: ['query']
      }
    },
    {
      name: 'schedule_study_reminder',
      description: 'Schedule a recurring study reminder or timetable alert. Uses standard cron expressions (e.g., "0 8 * * 1" for Every Monday at 8 AM). The instruction is what Aelixxr will say to the student.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Short name for the reminder (e.g., "MTH101 Class").' },
          cron_expression: { type: Type.STRING, description: 'Standard cron expression (minute hour day month day-of-week). Be mindful of UTC/WAT conversion.' },
          instruction: { type: Type.STRING, description: 'The exact message Aelixxr should send the student.' }
        },
        required: ['name', 'cron_expression', 'instruction']
      }
    }
];

export async function executeEducationTool(name: string, args: Record<string, any>, jobId?: string): Promise<any> {
    const { userId, orgId } = args;

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

      case 'grep_vault':
        const { nanoMemory } = await import('../services/nanoMemory.js');
        const results = await nanoMemory.grepVault(userId, args.query, args.limit || 3);
        if (!results || results.length === 0) {
            return { success: false, message: "No relevant study materials found for that query in the vault." };
        }
        return { success: true, results };

      case 'schedule_study_reminder':
        try {
            const { createCronJob } = await import('@naija-agent/database');
            const cronId = await createCronJob({
                userId: userId,
                orgId: orgId || 'LightBoy01',
                name: args.name,
                instruction: `SEND_MESSAGE: ${args.instruction}`,
                schedule: args.cron_expression,
                sectorPack: 'EducationPack',
                energyBudget: 2
            });
            return { success: true, cronId, message: `Reminder scheduled successfully for ${args.cron_expression}.` };
        } catch (error: any) {
             return { success: false, message: `Failed to schedule: ${error.message}` };
        }

      default:
        throw new Error('Unknown Education tool: ' + name);
    }
}
