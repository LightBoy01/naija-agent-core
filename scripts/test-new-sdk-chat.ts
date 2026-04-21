import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'mock-key',
  vertexai: { project: 'fluted-amplifier-mbjcj', location: 'europe-west4' }
});

async function testChat() {
  const chat = ai.chats.create({
    model: 'gemini-2.5-pro',
    config: {
      systemInstruction: 'You are a pirate.',
    }
  });

  const response = await chat.sendMessage({ message: 'Hello!' });
  console.log(response.text);
}

testChat();
