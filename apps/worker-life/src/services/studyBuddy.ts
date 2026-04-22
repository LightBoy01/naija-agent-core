import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import { SystemConfig } from '@naija-agent/types';
import { logger } from '../utils/logger.js';

export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string; // "A", "B", "C", "D"
    explanation: string;
}

export class StudyBuddyService {
    private ai: GoogleGenAI;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || 'mock';
        this.ai = new GoogleGenAI({ 
            apiKey,
            httpOptions: {
                baseUrl: 'https://aiplatform.googleapis.com',
                apiVersion: 'v1/publishers/google'
            }
        });
    }

    async generateQuiz(subject: string, topic: string, level: string = 'SS3'): Promise<QuizQuestion[]> {
        logger.info({ subject, topic, level }, '📚 Generating Quiz...');

        const quizSchema = {
            type: Type.OBJECT,
            properties: {
                questions: {
                    type: Type.ARRAY,
                    description: "An array of 5 multiple-choice questions.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: {
                                type: Type.STRING,
                                description: "The question text."
                            },
                            options: {
                                type: Type.ARRAY,
                                description: "The 4 multiple choice options (e.g. ['A) ...', 'B) ...', 'C) ...', 'D) ...']).",
                                items: { type: Type.STRING }
                            },
                            correctAnswer: {
                                type: Type.STRING,
                                description: "The correct option letter (e.g., 'A', 'B', 'C', or 'D')."
                            },
                            explanation: {
                                type: Type.STRING,
                                description: "A brief explanation of why the answer is correct."
                            }
                        },
                        required: ["question", "options", "correctAnswer", "explanation"]
                    }
                }
            },
            required: ["questions"]
        };

        const prompt = `
        Generate a 5-question multiple-choice quiz for a Nigerian student. 
        Output the result as a JSON object with a "questions" property containing exactly 5 question objects.
        Subject: ${subject}
        Topic: ${topic}
        Level: ${level} (e.g. WAEC/JAMB standard)

        Ensure questions are relevant to the Nigerian curriculum (WAEC/JAMB syllabus).
        You must output exactly 5 items in the array.
        `;

        try {
            let result;
            try {
                result = await this.ai.models.generateContent({
                    model: SystemConfig.MODELS.AELIXXR_WORKER,
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: quizSchema as any
                    }
                });
            } catch (primaryError: any) {
                if (primaryError.message.includes('429') || primaryError.message.includes('503') || primaryError.message.includes('fetch failed') || primaryError.message.includes('500') || primaryError.message.includes('Quota')) {
                    logger.warn('⚠️ Primary Worker Model Failed. Switching to Fallback for Quiz Generation.');
                    result = await this.ai.models.generateContent({
                        model: SystemConfig.MODELS.AELIXXR_FALLBACK,
                        contents: prompt,
                        config: {
                            responseMimeType: "application/json",
                            responseSchema: quizSchema as any
                        }
                    });
                } else {
                    throw primaryError;
                }
            }
            
            let text = "";
            if (result.candidates?.[0]?.content?.parts) {
                text = result.candidates[0].content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
            } else {
                text = result.text || '';
            }
            
            try {
                // Strip markdown backticks that some models inject even in JSON mode
                text = text.replace(/```(json)?/gi, '').trim();
                const quizObj = JSON.parse(text) as { questions: QuizQuestion[] };
                return quizObj.questions || [];
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
