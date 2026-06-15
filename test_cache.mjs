import { GoogleGenAI } from '@google/genai';

const originalFetch = globalThis.fetch;
globalThis.fetch = async function(...args) {
    console.log("FETCHING URL:", args[0]);
    return originalFetch.apply(this, args);
};

async function test() {
    const ai = new GoogleGenAI({
        apiKey: "AIzaSyBydElNN4L7rmK5u90nUz0C609oiUghexA",
        vertexai: false,
        httpOptions: {
            baseUrl: "https://generativelanguage.googleapis.com"
        },
        apiVersion: "v1beta"
    });

    try {
        console.log("Creating cache...");
        const response = await ai.caches.create({
            model: "models/gemini-3.1-flash-lite-preview",
            contents: [
                {
                    role: "user",
                    parts: [{ text: "This is a very long text...".repeat(1000) }]
                }
            ],
            systemInstruction: {
                role: "system",
                parts: [{ text: "You are a helpful AI." }]
            },
            ttl: "3600s"
        });
        console.log("Success!", response.name);
    } catch (e) {
        console.error("Failed:", e);
    }
}
test();
