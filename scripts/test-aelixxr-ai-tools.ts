import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getLifeTools } from '../apps/worker-life/src/tools.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testAIToolSelection() {
    console.log('🚀 TESTING AELIXXR AI NATIVE TOOL SELECTION (Gemma 4 26B)\n');
    
    const apiKey = process.env.GEMINI_API_KEY_LOS || process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey!);
    const tools = await getLifeTools();
    
    const aelixxrSoulPrompt = fs.readFileSync(path.join(__dirname, '../apps/worker-life/src/prompts/Aelixxr.Soul.md'), 'utf-8');

    const model = genAI.getGenerativeModel({
        model: 'gemma-4-26b-a4b-it',
        tools,
        systemInstruction: aelixxrSoulPrompt + "\n\n[DYNAMIC SYSTEM CONTEXT]:\n- Currency: NGN (₦)\n- Energy: 100",
    });

    const testCases = [
        { name: 'Web Search', msg: 'Aelixxr, what is the current price of Bitcoin today?' },
        { name: 'Save Note', msg: 'Aelixxr, please save this note: my new gate code is 5566.' },
        { name: 'Update Context', msg: 'My name is Chidi and my main goal is to Japa to Canada next year.' },
        { name: 'Generate Quiz', msg: 'Set a WAEC Biology quiz for me on Photosynthesis.' },
        { name: 'Generate Invite', msg: 'Give me my referral link to invite my guy.' },
        { name: 'Search Vault', msg: 'Can you check my vault for the GTBank receipt I saved?' },
        { name: 'Log Feedback', msg: 'Aelixxr, you talk too much. Make your answers shorter from now on.' },
        { name: 'Delegate Task', msg: 'Use your CommercePack to analyze the best selling products in Lagos.' }
    ];

    for (const tc of testCases) {
        console.log(`\n-------------------------------------------------`);
        console.log(`🧪 SCENARIO: ${tc.name}`);
        console.log(`💬 User: "${tc.msg}"`);
        try {
            const chat = model.startChat({ history: [] });
            const result = await chat.sendMessage(tc.msg);
            const calls = result.response.functionCalls();
            
            if (calls && calls.length > 0) {
                console.log(`✅ AI Chose Tool: ${calls[0].name}`);
                console.log(`📦 Extracted Args:`, JSON.stringify(calls[0].args, null, 2));
            } else {
                console.log(`⚠️ AI did not choose a tool. It replied:`);
                console.log(result.response.text());
            }
        } catch (e: any) {
            console.error(`❌ Error:`, e.message);
        }
    }
}

testAIToolSelection();
