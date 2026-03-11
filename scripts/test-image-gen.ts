import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('❌ GEMINI_API_KEY missing');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function testImageGen() {
  console.log('🎨 --- EMPIRE CREATIVE TEST (March 2026) --- 🚀');
  
  const modelName = "gemini-2.5-flash-image";
  console.log(`📡 Testing Model: models/${modelName}...`);

  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = "A futuristic Lagos at night with flying danfo buses, vibrant neon lights, and a massive Naija Agent Core holographic logo in the sky.";

    console.log(`👤 Prompt: "${prompt}"`);
    console.log('⏳ Generating image (this usually takes 5-10 seconds)...');

    const start = Date.now();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Generate a high-quality image based on this description: ${prompt}. Make it look professional and cinematic.` }] }]
    });

    const duration = (Date.now() - start) / 1000;
    
    // Check if the response contains inlineData (the image)
    const imagePart = result.response.candidates?.[0].content.parts.find(p => p.inlineData);

    if (imagePart && imagePart.inlineData) {
      const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const outputPath = path.join(process.cwd(), 'test-generated-image.png');
      fs.writeFileSync(outputPath, buffer);
      
      console.log(`✅ SUCCESS in ${duration}s!`);
      console.log(`🖼️  Image saved to: ${outputPath}`);
      console.log(`📊 Size: ${(buffer.length / 1024).toFixed(2)} KB`);
    } else {
      console.warn('⚠️  No image data returned. Gemini might have returned text instead:');
      console.log(`💬 Response: ${result.response.text()}`);
    }

  } catch (err: any) {
    console.error(`❌ FAILED: ${err.message}`);
    if (err.message.includes('429')) {
      console.log('💡 Tip: This model is in restricted preview. Wait a few minutes or check your quota.');
    }
  }
}

testImageGen();
