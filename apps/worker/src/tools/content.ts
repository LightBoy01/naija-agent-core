import { HandlerContext } from './definitions.js';
import { 
  saveKnowledge, 
  deleteKnowledge, 
  queryEntity 
} from '@naija-agent/firebase';
import { deductOrgBalance } from '@naija-agent/database';
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

    case 'search_documents': {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({
           apiKey: process.env.GEMINI_API_KEY || '',
           httpOptions: {
              baseUrl: 'https://aiplatform.googleapis.com',
              apiVersion: 'v1/publishers/google'
           }
        });

        // 1. Semantic Keyword Extraction
        const keywordPrompt = `
        Convert this user query into 5 specific search keywords for a document search.
        Query: "${args.query}"
        Output format: JSON Array of strings. Example: ["receipt", "school", "fees", "january", "2024"]
        `;
        
        const result = await genAI.models.generateContent({
           model: SystemConfig.MODELS.ZYNUX_FALLBACK,
           contents: keywordPrompt
        });
        const text = result.text || "";
        const jsonMatch = text?.match(/\[.*\]/);
        
        if (!jsonMatch) return { status: 'error', message: 'I could not understand the search query.' };
        const keywords = JSON.parse(jsonMatch[0]);

        // 2. Firestore Query
        const docs = await queryEntity(orgId, 'vault', [['keywords', 'array-contains-any', keywords]]);
        
        if (docs.length === 0) {
           return { status: 'success', message: `I searched for *${keywords.join(', ')}* but found no documents.` };
        }

        // 3. Format Results
        const results = docs.map((d: any) => 
           `- *${d.summary}* (${d.date || 'No Date'}) [${d.category}]`
        ).join('\n');

        return { 
           status: 'success', 
           message: `🔎 Found ${docs.length} documents for "${args.query}":\n\n${results}` 
        };

      } catch (e: any) {
        console.error('Document Search Failed:', e.message);
        return { status: 'error', message: 'The document search engine is temporarily down.' };
      }
    }

    case 'web_search': {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const searchGenAI = new GoogleGenAI({
           apiKey: process.env.GEMINI_API_KEY || '',
           httpOptions: {
              baseUrl: 'https://aiplatform.googleapis.com',
              apiVersion: 'v1/publishers/google'
           }
        });
        
        const trySearch = async (modelName: string) => {
          const searchResult = await searchGenAI.models.generateContent({
            model: modelName,
            contents: `Search for: ${args.query}. Summarize the key facts, prices, or news found.`,
            config: {
              tools: [{ googleSearch: {} }]
            }
          });
          
          return searchResult.text;
        };

        try {
          // Tier 1: Primary Model (ZYNUX_PRIMARY)
          const summary = await trySearch(SystemConfig.MODELS.ZYNUX_PRIMARY);
          return { status: 'success', result: summary };
        } catch (firstTryErr: any) {
           if (firstTryErr.message.includes('429')) {
              console.warn(`🔄 [SEARCH FALLBACK L1] Quota Exceeded. Retrying with Worker Model...`);
              try {
                  // Tier 2: Worker Model (AELIXXR_WORKER)
                  const secondSummary = await trySearch(SystemConfig.MODELS.AELIXXR_WORKER);
                  return { status: 'success', result: secondSummary, metadata: { fallback: 'worker' } };
              } catch (secondTryErr: any) {
                  if (secondTryErr.message.includes('429')) {
                      console.warn(`🔄 [SEARCH FALLBACK L2] Worker Busy. Retrying with Fallback Model...`);
                      // Tier 3: Fallback (Ultimate Reliability)
                      const thirdSummary = await trySearch(SystemConfig.MODELS.ZYNUX_FALLBACK);
                      return { status: 'success', result: thirdSummary, metadata: { fallback: 'fallback' } };
                  }
                  throw secondTryErr;
              }
           }
           throw firstTryErr;
        }
      } catch (err: any) {
        console.error('Web Search Failed:', err.message);
        return { status: 'error', message: 'Oga, I don search tire for today! I don reach my limit for now. Please try again later.' };
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
           httpOptions: {
              baseUrl: 'https://aiplatform.googleapis.com',
              apiVersion: 'v1/publishers/google'
           }
        });

        try {
          console.log(`🎨 [IMAGE GEN] Generating image for ${orgId}: ${args.prompt}`);
          
          const imageResult = await imageGenAI.models.generateContent({
             model: "gemini-3.1-flash-image-preview",
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
              console.warn(`🔄 [IMAGE FALLBACK] Quota Exceeded. Switching to Creative Prompt Fallback...`);
              
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
        console.error('Image Generation Failed:', err.message);
        return { status: 'error', message: 'I tried to create the image, but my creative engine failed. Please try again later.' };
      }
    }

    default:
      return null;
  }
}
