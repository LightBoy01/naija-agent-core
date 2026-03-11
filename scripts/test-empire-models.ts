import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY missing');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

const modelsToTest = [
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash"
];

const systemPrompt = "You are an expert Nigerian AI assistant. You speak fluent Pidgin English. You are helpful and precise.";
const userPrompt = "How far? Search the web and tell me the official exchange rate of Naira to Dollar today, March 11, 2026. Keep it short in Pidgin.";

async function runTests() {
  console.log('🚀 --- EMPIRE MODEL BATTLE (March 2026) --- 🚀\n');

  for (const modelName of modelsToTest) {
    console.log(`📡 Testing Model: models/${modelName}...`);
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        tools: [{ googleSearch: {} }] as any
      });

      const start = Date.now();
      const result = await model.generateContent([systemPrompt, userPrompt]);
      const duration = (Date.now() - start) / 1000;

      console.log(`✅ Success in ${duration}s`);
      console.log(`💬 Response: ${result.response.text()}\n`);
    } catch (err: any) {
      console.error(`❌ Failed: ${err.message}\n`);
    }
    // Wait between tests to avoid cascading 429s
    await new Promise(r => setTimeout(r, 2000));
  }
}

runTests();
