import { GoogleGenAI } from '@google/genai';

export const runtime = 'edge'; // Use edge for low latency streaming

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response('Missing GEMINI_API_KEY', { status: 500 });
    }

    const genAI = new GoogleGenAI({
      apiKey,
      vertexai: true,
      apiVersion: 'v1/publishers/google',
      httpOptions: {
        baseUrl: 'https://aiplatform.googleapis.com',
      }
    });

    // Convert message history to Gemini format
    const history = messages.slice(0, -1).map((msg: { role: string; content: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = genAI.chats.create({
      model: 'models/gemini-3.1-flash-lite', // Matches SystemConfig.MODELS.AELIXXR_WEB_CHAT
      history,
      config: {
        systemInstruction: "You are Aelixxr, the Life Companion. You provide deep, empathetic, and professional advice. Use LaTeX (enclosed in $ or $$) for any mathematical formulas or tables. Provide references and links where relevant.",
      }
    });

    const resultStream = await chat.sendMessageStream({ message: lastMessage });

    // Create a readable stream from the Gemini stream
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of resultStream) {
          const text = chunk.text;
          if (text) {
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    console.error('Streaming Error:', error);
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
