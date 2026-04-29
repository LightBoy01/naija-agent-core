import { GoogleGenAI } from '@google/genai';
import { StreamingTextResponse, StreamData } from 'ai';

export const runtime = 'edge'; // Use edge for low latency streaming

export async function POST(req: Request) {
  try {
    const { messages, userId } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response('Missing GEMINI_API_KEY', { status: 500 });
    }

    const genAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        baseUrl: 'https://aiplatform.googleapis.com',
        apiVersion: 'v1/publishers/google'
      }
    });

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp', // Use a fast streaming model
    });

    // Convert message history to Gemini format
    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({
      history,
      systemInstruction: "You are Aelixxr, the Life Companion. You provide deep, empathetic, and professional advice. Use LaTeX (enclosed in $ or $$) for any mathematical formulas or tables. Provide references and links where relevant.",
    });

    const result = await chat.sendMessageStream(lastMessage);

    const data = new StreamData();
    
    // Create a readable stream from the Gemini stream
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();
      },
    });

    return new StreamingTextResponse(stream, {}, data);
  } catch (error: any) {
    console.error('Streaming Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
