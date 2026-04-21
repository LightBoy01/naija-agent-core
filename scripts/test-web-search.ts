import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';
console.log("Using API Key:", apiKey.substring(0, 5) + '...');
const ai = new GoogleGenAI({ apiKey });

async function testSearch(modelName: string) {
    console.log(`Testing web search with model: ${modelName}...`);
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: "What is the official exchange rate of Naira to Dollar right now?",
            config: {
                tools: [{ googleSearch: {} } as any]
            }
        });
        console.log(`✅ SUCCESS with ${modelName}!`);
        console.log("Response:", response.text);
    } catch (error: any) {
        console.error(`❌ FAILED with ${modelName}:`, error.message);
    }
}

async function run() {
    await testSearch('gemini-3-flash-preview');
    await testSearch('gemini-3.1-flash-lite-preview');
    await testSearch('gemini-2.5-flash');
}

run();
