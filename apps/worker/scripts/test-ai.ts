import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env');
    process.exit(1);
  }

  console.log('✅ Found GEMINI_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-lite-preview",
    tools: [{ googleSearch: {} }] as any
  });

  const systemPrompt = "You are a helpful Nigerian AI assistant. You understand and speak Nigerian Pidgin English fluently. You are witty, helpful, and concise.";
  const userPrompt = "How far now? Search the web and tell me the current exchange rate of Naira to Dollar today, March 11, 2026.";

  console.log(`\n🤖 System Prompt: ${systemPrompt}`);
  console.log(`👤 User Prompt: ${userPrompt}\n`);
  console.log('⏳ Sending request to Gemini...');

  try {
    const result = await model.generateContent([systemPrompt, userPrompt]);
    const response = result.response;
    const text = response.text();
    
    console.log(`\n✅ Gemini Response:\n${text}`);
  } catch (error: any) {
    console.error(`\n❌ Error calling Gemini: ${error.message}`);
  }
}

testGemini();
