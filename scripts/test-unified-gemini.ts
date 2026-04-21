import * as dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

async function testUnifiedGemini() {
  console.log('🧪 --- TESTING UNIFIED GEMINI ENDPOINT (Standard API Key) --- 🧪');

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
      console.error('❌ Missing GEMINI_API_KEY in .env');
      process.exit(1);
  }

  // INITIALIZE STANDARD ENDPOINT
  const genAI = new GoogleGenAI(apiKey);
  const modelName = 'gemini-3-flash-preview'; // Updated to actual project model

  console.log(`📡 Endpoint: Standard (Default)`);
  console.log(`🤖 Model: ${modelName}`);

  // --- TEST 1: MULTIMODAL (Vision) ---
  console.log('\n🔍 [TEST 1/2] Multimodal Vision (Inline Data)...');
  try {
    const fakeImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const result = await genAI.models.generateContent({
        model: modelName,
        contents: [{
            parts: [
                { text: 'Describe this image simply.' },
                { inlineData: { data: fakeImageBase64, mimeType: 'image/png' } }
            ]
        }]
    });
    console.log('✅ Vision Result:', result.text);
  } catch (err: any) {
    console.error('❌ Vision Failed:', err.message);
  }

  // --- TEST 2: TOOL CALLING (Function Calling) ---
  console.log('\n🛠️ [TEST 2/2] Tool Calling (Native SDK)...');
  try {
    const tools = [{
        functionDeclarations: [{
            name: 'get_weather',
            description: 'Get weather for a city',
            parameters: {
                type: Type.OBJECT,
                properties: { city: { type: Type.STRING } },
                required: ['city']
            }
        }]
    }];

    const chat = genAI.chats.create({
        model: modelName,
        config: { tools }
    });

    const result = await chat.sendMessage({ message: "What is the weather in Lagos?" });
    
    if (result.functionCalls) {
        console.log('✅ Tool Calling Success! AI requested:', JSON.stringify(result.functionCalls));
    } else {
        console.warn('⚠️ AI replied with text instead of tool call:', result.text);
    }
  } catch (err: any) {
    console.error('❌ Tool Calling Failed:', err.message);
  }

  console.log('\n🏁 --- UNIFIED TEST COMPLETE --- 🏁');
  process.exit(0);
}

testUnifiedGemini();
