import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: { question: { type: SchemaType.STRING } }
            }
        }
    }
});

async function run() {
    try {
        console.log("Testing gemini with responseSchema...");
        const res = await model.generateContent("Generate 1 question");
        console.log(res.response.text());
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
