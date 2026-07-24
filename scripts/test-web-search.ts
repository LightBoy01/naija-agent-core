import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function testSearch(modelName: string) {
  const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    console.error('No API key found!');
    return;
  }

  let baseUrl = 'https://aiplatform.googleapis.com';
  let apiVersion = 'v1/publishers/google';
  if (apiKey.startsWith('AIza')) {
    baseUrl = 'https://generativelanguage.googleapis.com';
    apiVersion = 'v1beta';
  }

  const searchGenAI = new GoogleGenAI({ 
    apiKey,
    vertexai: !apiKey.startsWith('AIza'),
    apiVersion,
    httpOptions: { baseUrl }
  });

  console.log(`\nTesting Web Search Grounding with model: ${modelName}`);
  try {
    const searchResult = await searchGenAI.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: 'Search for: current ice water news June 2026. Summarize the key facts.' }] }],
      config: {
        tools: [{ googleSearch: {} }] as any
      }
    });

    let text = "";
    if (searchResult.candidates?.[0]?.content?.parts) {
        text = searchResult.candidates[0].content.parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
    } else {
        text = searchResult.text || "";
    }
    console.log(`✅ Success with ${modelName}:\n`, text.trim().substring(0, 500) + '...');
  } catch (err: any) {
    console.error(`❌ Error with ${modelName}:`, err.message);
  }
}

async function run() {
  await testSearch('models/gemini-3-flash-preview');
  await testSearch('models/gemma-2-27b-it'); // Testing the Gemma model the user mentioned
}

run();
