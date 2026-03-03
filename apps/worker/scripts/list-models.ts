import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env');
    process.exit(1);
  }

  console.log('✅ Found GEMINI_API_KEY');

  // Initialize the Google Generative AI client
  // Note: We might need to adjust the API version if the default doesn't work,
  // but the SDK usually handles this.
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    // The SDK might not have a direct 'listModels' on the main class in all versions,
    // but let's try to find it via the model manager if it exists, or use the
    // direct API method if the SDK exposes it.
    //
    // Actually, looking at the SDK documentation (and typical usage),
    // listing models is often done via a specific manager or simple fetch.
    // However, for the purpose of this script and the installed SDK version,
    // we might need to rely on the error message from the previous attempt
    // which suggested calling ListModels.
    //
    // Let's try to use the raw API via fetch if the SDK doesn't make it obvious,
    // or check if the SDK has a 'getGenerativeModel' that we can't use to list.
    //
    // Wait, the search result python example showed `genai.list_models()`.
    // In the Node.js SDK, it's often `genAI.getGenerativeModel` but listing might be different.
    // Let's try a simple fetch to the REST API to be sure, as it's dependency-free regarding SDK versions.
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    console.log('available models:');
    if (data.models) {
        data.models.forEach((model: any) => {
            console.log(`- ${model.name} (${model.supportedGenerationMethods.join(', ')})`);
        });
    } else {
        console.log('No models found in response.');
    }

  } catch (error: any) {
    console.error(`\n❌ Error listing models: ${error.message}`);
  }
}

listModels();
