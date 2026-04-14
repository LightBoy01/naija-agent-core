const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

  try {
    console.log('Testing gemini-3.1-flash-lite-preview...');
    const result = await model.generateContent('Say hello world');
    console.log('Response:', result.response.text());
    console.log('✅ SUCCESS: Model is working.');
  } catch (e) {
    console.error('❌ FAILURE:', e.message);
  }
}
test();
