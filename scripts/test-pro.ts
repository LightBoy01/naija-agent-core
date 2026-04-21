import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function testPro(mode: 'aistudio' | 'vertex') {
  console.log(`Testing gemini-2.5-pro on ${mode.toUpperCase()}...`);
  
  const apiKey = process.env.GEMINI_API_KEY || '';
  
  let config: any = { apiKey };
  
  if (mode === 'vertex') {
    config.vertexai = {
      project: 'fluted-amplifier-mbjcj',
      location: 'europe-west4'
    };
  }

  const ai = new GoogleGenAI(config);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: 'Tell me a one-sentence joke about a potato.',
    });
    console.log("✅ SUCCESS!");
    console.log("Response:", response.text);
  } catch (error: any) {
    console.error("❌ FAILED:", error.message);
  }
}

const isVertexKey = process.env.GEMINI_API_KEY?.startsWith('AQ');
testPro(isVertexKey ? 'vertex' : 'aistudio');
