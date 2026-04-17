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

        const quizSchema = {
            type: SchemaType.ARRAY,
            description: "A 5-question multiple-choice quiz.",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    question: {
                        type: SchemaType.STRING,
                        description: "The question text."
                    },
                    options: {
                        type: SchemaType.ARRAY,
                        description: "The 4 multiple choice options (e.g. ['A) ...', 'B) ...', 'C) ...', 'D) ...']).",
                        items: { type: SchemaType.STRING }
                    },
                    correctAnswer: {
                        type: SchemaType.STRING,
                        description: "The correct option letter (e.g., 'A', 'B', 'C', or 'D')."
                    },
                    explanation: {
                        type: SchemaType.STRING,
                        description: "A brief explanation of why the answer is correct."
                    }
                },
                required: ["question", "options", "correctAnswer", "explanation"]
            }
        };

        const model = this.genAI.getGenerativeModel({ 
            model: SystemConfig.MODELS.AELIXXR_WORKER, // Use worker model
            generationConfig: { 
                responseMimeType: "application/json",
                responseSchema: quizSchema as any
            }
        });

        const prompt = `
        Generate a 5-question multiple-choice quiz for a Nigerian student.
        Subject: ${subject}
        Topic: ${topic}
        Level: ${level} (e.g. WAEC/JAMB standard)

        Ensure questions are relevant to the Nigerian curriculum (WAEC/JAMB syllabus).
        `;

        try {
            const result = await model.generateContent(prompt);
            let text = result.response.text();
            
            try {
                // Strip markdown backticks that some models inject even in JSON mode
                text = text.replace(/```(json)?/gi, '').trim();
                const quiz = JSON.parse(text) as QuizQuestion[];
                return quiz;
            } catch (parseError: any) {
                logger.error({ text, error: parseError.message }, '❌ Failed to parse native quiz JSON');
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
