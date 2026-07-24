import { GeminiProvider } from './packages/ai/src/providers/gemini.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No API key');
  
  const provider = new GeminiProvider(apiKey);
  
  const history = [
    { role: 'user', parts: [{ text: 'Hello, my name is John.' }] },
    { role: 'assistant', parts: [{ text: 'Hi John! How can I help you today?' }] },
    { role: 'user', parts: [{ text: 'What is my name?' }] }
  ];
  
  console.log('Testing GeminiProvider with history...');
  // Type assertion since we manually feed it the 'assistant' role which is not in the type definition
  const response = await provider.chat(history as any, 'Do you remember?', { model: 'gemini-1.5-flash' });
  console.log('Response:', response.text);
}

test().catch(console.error);
