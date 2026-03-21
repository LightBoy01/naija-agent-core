import { GoogleGenerativeAI } from '@google/generative-ai';
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
            model: SystemConfig.MODELS.ZYNUX_PRIMARY, // Use Flash for speed/cost
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Generate a 5-question multiple-choice quiz for a Nigerian student.
        Subject: ${subject}
        Topic: ${topic}
        Level: ${level} (e.g. WAEC/JAMB standard)

        Format: JSON Array of objects.
        Schema:
        [
          {
            "question": "The question text",
            "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
            "correctAnswer": "A",
            "explanation": "Why this is correct"
          }
        ]
        
        Ensure questions are relevant to the Nigerian curriculum (WAEC/JAMB syllabus).
        `;

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const quiz = JSON.parse(text) as QuizQuestion[];
            return quiz;
        } catch (error: any) {
            logger.error({ error: error.message }, '❌ Failed to generate quiz');
            throw new Error("I couldn't generate the quiz right now. Abeg try again.");
        }
    }
}

export const studyBuddy = new StudyBuddyService();
