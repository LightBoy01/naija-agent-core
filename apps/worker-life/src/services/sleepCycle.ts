import { GoogleGenAI, Type } from '@google/genai';
import { SystemConfig } from '@naija-agent/types';
import { getChatHistory, findOrCreateChat } from '@naija-agent/firebase';
import { lifeMemory } from './lifeMemory.js';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

export class SleepCycleService {
    async consolidateMemory(userId: string, orgId: string = 'naija-agent-master') {
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
You are Aelixxr's Subconscious Mind. Your job is to read the recent chat history between Aelixxr (the AI) and the User, and extract any new, permanent facts about the user's life.
Do NOT extract transient emotions or temporary states (e.g., "user is tired today").
DO extract:
- Names of family members or friends.
- Long-term goals (e.g., "Japa to UK", "Buy a house").
- Health conditions or allergies.
- Persistent preferences (e.g., "likes cheap markets", "vegetarian").

Current Life Context:
${JSON.stringify(currentContext)}

Recent Chat History:
${history.map((m: any) => `${m.role === 'assistant' ? 'Aelixxr' : 'User'}: ${m.content}`).join('\n')}

INSTRUCTION: Compare the Current Life Context with the Recent Chat History. If you find NEW or UPDATED facts, output a JSON object containing the updates that need to be merged into the Life Context. 
CRITICAL: If you are adding a new item to an array (like 'goals' or 'allergies'), you MUST output the ENTIRE combined array (including the old items). Do not output just the new item, or it will overwrite the old ones!
If there is nothing new to learn, output an empty object {}.
`;

            const schema = {
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

            const model = genAI.models.generateContent({
                model: SystemConfig.MODELS.AELIXXR_WORKER || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.1
                }
            });

            const result = await model;
            let text = result.text || '{}';
            
            // Clean markdown code blocks if the LLM includes them
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            let updates = {};
            try {
                updates = JSON.parse(text);
            } catch (e: any) {
                logger.error({ userId, text, error: e.message }, '❌ [SLEEP CYCLE] Failed to parse JSON from LLM.');
                return;
            }

            if (Object.keys(updates).length > 0) {
                logger.info({ userId, updates }, '🧠 [SLEEP CYCLE] New facts learned! Updating memory...');
                await lifeMemory.updateContext(userId, updates);
            } else {
                logger.info({ userId }, '💤 [SLEEP CYCLE] No new facts learned this cycle.');
            }

        } catch (error: any) {
            logger.error({ userId, error: error.message }, '❌ [SLEEP CYCLE] Memory consolidation failed.');
        }
    }
}

export const sleepCycle = new SleepCycleService();
