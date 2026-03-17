import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function testAI() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `You are the Sovereign Master Bot of the Naija Agent Network. You are talking to the Oga Boss (The Creator).
          Your role is to manage the entire Empire. Use 'get_network_stats', 'audit_tenant', and 'broadcast_to_bosses' to assist the Oga Boss.
          Be extremely loyal, sharp, and concise. The Empire is in your hands.`;

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: `System Instruction: ${systemPrompt}` }] },
      { role: 'model', parts: [{ text: 'Understood. I am ready to assist.' }] },
    ],
  });

  console.log('🤖 Sending: "who is master bot?"');
  try {
    const result = await chat.sendMessage('who is master bot?');
    const response = await result.response;
    console.log('✅ AI Response:', response.text());
  } catch (error: any) {
    console.error('❌ AI Error:', error.message);
  }
}

testAI();
