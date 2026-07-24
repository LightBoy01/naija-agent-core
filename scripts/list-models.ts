import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    console.error('No API key found!');
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // We can just fetch the models using fetch to the REST API for simplicity
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.models) {
      const gemmaModels = data.models.filter((m: any) => m.name.toLowerCase().includes('gemma'));
      console.log('Available Gemma Models on this API Key:');
      gemmaModels.forEach((m: any) => {
        console.log(`- ${m.name}`);
        if (m.supportedGenerationMethods) {
           console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
        }
      });
    } else {
      console.log('No models found or error:', data);
    }
  } catch(e) {
    console.error('Error fetching models:', e);
  }
}

run();
