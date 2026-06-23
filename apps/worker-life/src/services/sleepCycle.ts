import { GoogleGenAI, Type } from '@google/genai';
import { SystemConfig } from '@naija-agent/types';
import { getChatHistory, findOrCreateChat } from '@naija-agent/database';
import { lifeMemory } from './lifeMemory.js';
import { logger } from '../utils/logger.js';
import { geminiBreaker } from './circuitBreaker.js';
import 'dotenv/config';

export class SleepCycleService {
    async consolidateMemory(userId: string, orgId: string = 'naija_agent_hq') {
        logger.info({ userId }, '💤 [SLEEP CYCLE] Starting memory consolidation...');
        try {
            const chatId = await findOrCreateChat(orgId, `${userId}_life`, 'User');
            // Fetch last 20 messages to get a good context window
            const history = await getChatHistory(chatId, 20);
            
            if (!history || history.length < 2) {
                logger.info({ userId }, '💤 [SLEEP CYCLE] Not enough history to consolidate.');
                return;
            }

            const currentContext = await lifeMemory.getContext(userId);

            const prompt = `
            You are Aelixxr's Subconscious Mind. Your job is to read the recent chat history between Aelixxr (the AI) and the User, and extract permanent facts for the User's Life Context.

            Facts to extract (Cultural & Practical Nuance):
            1. **Permanent Facts:** Names of family/friends, spouse, children's schools.
            2. **Long-term Goals:** "Japa to UK", "Build house in village", "Rent due date".
            3. **Financial Commitments:** Debt, recurring bills, specific market preferences.
            4. **Health & Life:** Conditions, allergies, specific medications mentioned.
            5. **Rapport & Soul:** Does the user like Pidgin or formal English? Do they prefer blunt honesty or soft encouragement?
            6. **Social Capital:** Who does the user trust or rely on?

            Current Life Context:
            ${JSON.stringify(currentContext)}

            Recent Chat History:
            ${history.map((m: any) => `${m.role === 'assistant' ? 'Aelixxr' : 'User'}: ${m.content}`).join('\\n')}

            INSTRUCTION: 
            1. Output a JSON object containing 'updates' for the Life Context.
            2. Output a 'summary' string (1-2 sentences) describing the core of this interaction.
            3. Output an 'importance' score (1-5) for this interaction.

            CRITICAL: 
            - If adding to an array (goals, preferences), output the ENTIRE combined array.
            - If there is nothing new, 'updates' should be {}.
            - Standardize all currency amounts to Naira/Kobo.
            `;


            const schema = {
                type: Type.OBJECT,
                properties: {
                    updates: {
                        type: Type.OBJECT,
                        properties: {
                            fullName: { type: Type.STRING },
                            family: {
                                type: Type.OBJECT,
                                properties: {
                                    spouse: { type: Type.STRING },
                                    children: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                name: { type: Type.STRING },
                                                age: { type: Type.NUMBER },
                                                school: { type: Type.STRING }
                                            }
                                        }
                                    }
                                }
                            },
                            health: {
                                type: Type.OBJECT,
                                properties: {
                                    allergies: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    medications: { type: Type.ARRAY, items: { type: Type.STRING } }
                                }
                            },
                            goals: { type: Type.ARRAY, items: { type: Type.STRING } },
                            preferences: {
                                type: Type.OBJECT,
                                properties: {
                                    market: { type: Type.STRING },
                                    diet: { type: Type.STRING }
                                }
                            }
                        }
                    },
                    summary: { type: Type.STRING },
                    importance: { type: Type.NUMBER }
                },
                required: ['updates', 'summary', 'importance']
            };

            const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY;
            if (!apiKey || apiKey === 'mock-key') {
                logger.warn('⚠️ [SLEEP CYCLE] Skipping due to missing API key.');
                return;
            }

            const genAI = new GoogleGenAI({
                apiKey: apiKey,
                httpOptions: {
                    baseUrl: 'https://aiplatform.googleapis.com',
                    apiVersion: 'v1/publishers/google'
                }
            });

            const modelName = SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-3.1-flash-lite';
            logger.info({ role: 'Background', model: modelName }, '💤 Sleep Cycle extracting memory & summary');

            const model = genAI.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.1
                }
            });

            const result = await model;
            let text = "";
            if (result.candidates?.[0]?.content?.parts) {
                text = result.candidates[0].content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
            } else {
                text = result.text || '{}';
            }
            
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            let data: any = {};
            try {
                data = JSON.parse(text);
            } catch (e: any) {
                logger.error({ userId, text, error: e.message }, '❌ [SLEEP CYCLE] Failed to parse JSON from LLM.');
                return;
            }

            const { updates, summary, importance } = data;

            // 1. Update Context (Structured Memory)
            if (updates && Object.keys(updates).length > 0) {
                logger.info({ userId, updates }, '🧠 [SLEEP CYCLE] New facts learned! Updating context...');
                await lifeMemory.updateContext(userId, updates);
            }

            // 2. Save Semantic Episodic Memory (Unstructured Vector Memory)
            if (summary) {
                logger.info({ userId, summary }, '📖 [SLEEP CYCLE] Saving episodic summary...');
                const embedKey = process.env.GEMINI_API_KEY_EMBEDDING || apiKey;
                const embedModel = SystemConfig.MODELS.NANO_EMBEDDING || 'gemini-embedding-2';
                const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/${embedModel}:embedContent?key=${embedKey}`;
                
                const response = await geminiBreaker.execute(() =>
                    fetch(embedUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: { parts: [{ text: summary }] }
                        })
                    })
                );
                
                const result = await response.json() as any;
                const embedding = (result.embedding?.values || []).slice(0, 768);
                
                if (embedding.length > 0) {
                    await lifeMemory.saveSemanticMemory(
                        userId, 
                        orgId, 
                        'episodic', 
                        summary, 
                        embedding,
                        importance || 1
                    );
                } else {
                    logger.warn({ userId, result }, '⚠️ [SLEEP CYCLE] Failed to generate embedding for summary.');
                }
            }

            logger.info({ userId }, '💤 [SLEEP CYCLE] Memory consolidation complete.');

        } catch (error: any) {
            logger.error({ userId, error: error.message }, '❌ [SLEEP CYCLE] Memory consolidation failed.');
        }
    }
}

export const sleepCycle = new SleepCycleService();
