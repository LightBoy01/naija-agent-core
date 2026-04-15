import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { SystemConfig } from '@naija-agent/types';
import { logger } from '../utils/logger.js';

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string; // "A", "B", "C", "D"
    explanation: string;
}

export class StudyBuddyService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock';
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async generateQuiz(subject: string, topic: string, level: string = 'SS3'): Promise<QuizQuestion[]> {
        logger.info({ subject, topic, level }, '📚 Generating Quiz...');

        const model = this.genAI.getGenerativeModel({ 
            model: SystemConfig.MODELS.AELIXXR_WORKER, // Use 4B model for fast/cheap generation
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        You are a quiz generation API. 
        Generate a 5-question multiple-choice quiz for a Nigerian student.
        Subject: ${subject}
        Topic: ${topic}
        Level: ${level} (e.g. WAEC/JAMB standard)

        You must output the final JSON array wrapped entirely inside <quiz> and </quiz> tags. Do not put anything else inside those tags.
        Schema for the array:
        [
          {
            "question": "The question text",
            "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
            "correctAnswer": "A",
            "explanation": "Why this is correct"
          }
        ]
        `;

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            
            // Extract JSON from <quiz> tags
            let cleanedText = text;
            const startTag = '<quiz>';
            const endTag = '</quiz>';
            const startIndex = text.lastIndexOf(startTag);
            const endIndex = text.lastIndexOf(endTag);
            
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                cleanedText = text.substring(startIndex + startTag.length, endIndex).trim();
            } else {
                // Fallback to finding the last [ and last ]
                const firstBracket = text.lastIndexOf('[');
                const lastBracket = text.lastIndexOf(']');
                if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                    cleanedText = text.substring(firstBracket, lastBracket + 1);
                } else {
                    cleanedText = text.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
                }
            }
            
            try {
                const quiz = JSON.parse(cleanedText) as QuizQuestion[];
                return quiz;
            } catch (parseError: any) {
                logger.error({ text, cleanedText, error: parseError.message }, '❌ Failed to parse quiz JSON');
                throw new Error("I couldn't generate the quiz right now. Abeg try again.");
            }
        } catch (error: any) {
            if (error.message === "I couldn't generate the quiz right now. Abeg try again.") {
                throw error;
            }
            logger.error({ error: error.message }, '❌ Failed to generate quiz');
            throw new Error("I couldn't generate the quiz right now. Abeg try again.");
        }
    }
}

export const studyBuddy = new StudyBuddyService();
