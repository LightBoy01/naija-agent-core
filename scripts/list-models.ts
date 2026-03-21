import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY is missing.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  try {
    console.log('🔍 Fetching available Gemini models...');
    // Note: The SDK method to list models might vary slightly depending on version, 
    // but usually it's exposed via the API directly or we can just try a few known ones.
    // The google-generative-ai SDK doesn't expose listModels directly in some versions.
    // We will try to test a few known models.
    
    const candidates = [
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-pro',
        'gemini-1.0-pro'
    ];

    console.log('\n--- Testing Model Availability ---');
    
    for (const modelName of candidates) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('Hello, are you there?');
            const response = result.response.text();
            console.log(`✅ ${modelName}: AVAILABLE (Response: "${response.substring(0, 20)}...")`);
        } catch (e: any) {
             if (e.message.includes('404')) {
                 console.log(`❌ ${modelName}: NOT FOUND`);
             } else {
                 console.log(`⚠️ ${modelName}: ERROR (${e.message.substring(0, 50)}...)`);
             }
        }
    }

  } catch (error: any) {
    console.error('❌ Failed to list models:', error.message);
  }
}

listModels();
