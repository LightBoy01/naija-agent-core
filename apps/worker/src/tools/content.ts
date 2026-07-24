import { Type } from '@google/genai';
import { HandlerContext } from './definitions.js';
import { logger } from '../utils/logger.js';

export const CONTENT_TOOLS = [
  {
    name: "web_search",
    description: "Searches the live internet for real-time information (Exchange rates, market prices, news).",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "The search query." } },
      required: ["query"]
    }
  },
  {
    name: "generate_image",
    description: "Generate a creative image based on a text description. Use this when the user asks to see something, create an image, or design a logo.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: "The detailed description of the image to generate (e.g., 'A futuristic Lagos at night with flying danfo buses')."
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "save_knowledge",
    description: "Updates business facts or prices. (Requires Boss Auth)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: "Key name" },
        content: { type: Type.STRING, description: "Details/Price" },
        imageUrl: { type: Type.STRING, description: "Product Image URL" }
      },
      required: ["key", "content"]
    }
  },
  {
    name: "delete_knowledge",
    description: "Deletes obsolete business knowledge. (Requires Boss Auth)",
    parameters: {
      type: Type.OBJECT,
      properties: { key: { type: Type.STRING, description: "Key to delete" } },
      required: ["key"]
    }
  }
];

import { saveKnowledge, deleteKnowledge, deductOrgBalance } from '@naija-agent/database';
import { formatCurrency } from '../utils/currency.js';
import { SystemConfig } from '@naija-agent/types';

export async function handleContentTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, from, isAdmin, isStaff, whatsappService, currency } = ctx;

  switch (name) {
    case 'save_knowledge':
      await saveKnowledge(orgId, args.key, args.content, args.imageUrl);
      return { status: 'success', code: 'SAVED', key: args.key };

    case 'delete_knowledge':
      await deleteKnowledge(orgId, args.key);
      return { status: 'success', code: 'DELETED', key: args.key };



    case 'web_search': {
      try {
        const axios = (await import('axios')).default;
        
        const searxngPromise = (async () => {
            const searxngUrl = process.env.SEARXNG_URL || 'http://159.195.150.66:8181';
            const res = await axios.get(`${searxngUrl}/search`, {
              params: { q: args.query, format: 'json' },
              timeout: 5000 
            });
            const results = res.data.results || [];
            if (results.length === 0) throw new Error("No SearXNG results");
            const summary = results.slice(0, 5).map((r: any) => `Title: ${r.title}\nDescription: ${r.content || r.snippet}\nURL: ${r.url}`).join('\n\n');
            return { status: 'success', result: `[Source: SearXNG]\n\n${summary}` };
        })();

        const bravePromise = (async () => {
            const apiKey = process.env.BRAVE_API_KEY;
            if (!apiKey) throw new Error("BRAVE_API_KEY not set");
            const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
              params: { q: args.query, count: 5 },
              headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
              timeout: 5000 // Reduced timeout to prevent cascading failure
            });
            const results = res.data.web?.results || [];
            if (results.length === 0) throw new Error("No Brave results");
            const summary = results.map((r: any) => `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`).join('\n\n');
            return { status: 'success', result: `[Source: Brave]\n\n${summary}` };
        })();

        try {
            return await Promise.any([searxngPromise, bravePromise]);
        } catch (e: any) {
            logger.info('Web Search Failed: Both engines failed or timed out');
            return { error: 'Oga, I don search tire for today! Both engines failed.' };
        }

      } catch (err: any) {
          logger.error({ error: err.message }, 'Web Search Setup Failed');
          return { error: 'Oga, I don search tire for today! Both engines failed.' };
      }
    }

    case 'generate_image': {
      const imageGenFee = 5000; // ₦50.00 Creative Fee
      try {
        const { GoogleGenAI } = await import('@google/genai');

        if (!isAdmin && !isStaff) {
           const deductResult = await deductOrgBalance(orgId, imageGenFee);
           if (deductResult === null) {
              const formattedFee = formatCurrency(imageGenFee / 100, currency.locale, currency.code);
              return { status: 'error', message: `Oga, your balance no reach for this creative work. Image generation costs ${formattedFee}.` };
           }
        }

        const imageGenAI = new GoogleGenAI({
           apiKey: process.env.GEMINI_API_KEY || '',
           vertexai: true,
           apiVersion: 'v1/publishers/google',
           httpOptions: {
              baseUrl: 'https://aiplatform.googleapis.com'
           }
        });

        try {
          logger.info({ orgId, prompt: args.prompt }, 'Generating image');
          
          const imageResult = await imageGenAI.models.generateContent({
             model: SystemConfig.MODELS.IMAGE_GEN,
             contents: `Generate a high-quality image based on this description: ${args.prompt}. Make it look professional and vibrant.`
          });

          const imagePart = imageResult.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
          
          if (imagePart && imagePart.inlineData) {
             const buffer = Buffer.from(imagePart.inlineData.data || '', 'base64');
             await whatsappService.sendImage(from, buffer, `✨ *Generated Image:* "${args.prompt}"`);
             return { status: 'success', message: "Image generated and sent successfully." };
          } else {
             const textResponse = imageResult.text;
             return { status: 'error', message: `Oga, I no fit generate that image: ${textResponse}` };
          }
        } catch (genErr: any) {
           if (genErr.message.includes('429')) {
              logger.warn({ orgId }, 'Image generation quota exceeded — switching to Creative Prompt Fallback');
              
              const promptResult = await imageGenAI.models.generateContent({
                model: SystemConfig.MODELS.ZYNUX_FALLBACK,
                contents: `The image generator is busy. Create a stunning, high-quality, professional image generation prompt for this idea: ${args.prompt}. Write it in a way that the user can visualize the result.`
              });

              const artisticPrompt = promptResult.text;
              const response = `🎨 *Creative Engine Update:* Oga, my drawing hand don tire small (Quota Limit), but look wetin I been wan draw for you:\n\n${artisticPrompt}\n\n_Wait small, I go fit draw am later!_`;
              
              return { status: 'success', result: response, metadata: { fallback: 'creative-prompt' } };
           }
           throw genErr;
        }

      } catch (err: any) {
        logger.error({ error: err.message }, 'Image Generation Failed');
        return { status: 'error', message: 'I tried to create the image, but my creative engine failed. Please try again later.' };
      }
    }

    default:
      return null;
  }
}
