import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const projectId = 'fluted-amplifier-mbjcj';

// Initialize the new unified SDK for Vertex AI Express Mode
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'mock-key',
  vertexai: {
    project: projectId,
    location: 'europe-west4' // Using the fast European region we found earlier
  }
});

async function testNewSDK() {
  console.log("🚀 Testing the new @google/genai SDK with Vertex Express Mode...");
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: 'Tell me a one-sentence joke about a software engineer.',
    });
    console.log("✅ SUCCESS!");
    console.log("Response:", response.text);
  } catch (error: any) {
    console.error("❌ FAILED:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

testNewSDK();
