import { HandlerContext } from './definitions.js';
import { 
  saveKnowledge, 
  deleteKnowledge, 
  deductBalance,
  queryEntity 
} from '@naija-agent/firebase';
import { formatCurrency } from '../utils/currency.js';

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
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite-preview-02-05' });

        // 1. Semantic Keyword Extraction
        const keywordPrompt = `
        Convert this user query into 5 specific search keywords for a document search.
        Query: "${args.query}"
        Output format: JSON Array of strings. Example: ["receipt", "school", "fees", "january", "2024"]
        `;
        
        const result = await model.generateContent(keywordPrompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[.*\]/);
        
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
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const searchGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        
        const trySearch = async (modelName: string) => {
          const searchModel = searchGenAI.getGenerativeModel({ 
            model: modelName,
            tools: [{ googleSearch: {} }] as any
          });

          const searchResult = await searchModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: `Search for: ${args.query}. Summarize the key facts, prices, or news found.` }] }]
          });
          
          return searchResult.response.text();
        };

        try {
          // Tier 1: Gemini 3.1 Preview
          const summary = await trySearch("gemma-4-26b-a4b-it");
          return { status: 'success', result: summary };
        } catch (firstTryErr: any) {
           if (firstTryErr.message.includes('429')) {
              console.warn(`🔄 [SEARCH FALLBACK L1] 3.1 Quota Exceeded. Retrying with Flash-Lite Latest...`);
              try {
                  // Tier 2: Flash-Lite Latest (Stable)
                  const secondSummary = await trySearch("gemini-flash-lite-latest");
                  return { status: 'success', result: secondSummary, metadata: { fallback: 'flash-lite-latest' } };
              } catch (secondTryErr: any) {
                  if (secondTryErr.message.includes('429')) {
                      console.warn(`🔄 [SEARCH FALLBACK L2] Flash-Lite Latest Busy. Retrying with Gemini 2.5 Flash...`);
                      // Tier 3: 2.5 Flash (Ultimate Reliability)
                      const thirdSummary = await trySearch("gemini-2.5-flash");
                      return { status: 'success', result: thirdSummary, metadata: { fallback: 'gemini-2.5-flash' } };
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
        const { GoogleGenerativeAI } = await import('@google/generative-ai');

        if (!isAdmin && !isStaff) {
           const deductResult = await deductBalance(orgId, imageGenFee);
           if (deductResult === null) {
              const formattedFee = formatCurrency(imageGenFee / 100, currency.locale, currency.code);
              return { status: 'error', message: `Oga, your balance no reach for this creative work. Image generation costs ${formattedFee}.` };
           }
        }

        const imageGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const imageModel = imageGenAI.getGenerativeModel({ 
          model: "gemini-3.1-flash-image-preview" 
        });

        try {
          console.log(`🎨 [IMAGE GEN] Generating image for ${orgId}: ${args.prompt}`);
          
          const imageResult = await imageModel.generateContent({
             contents: [{ role: 'user', parts: [{ text: `Generate a high-quality image based on this description: ${args.prompt}. Make it look professional and vibrant.` }] }]
          });

          const imagePart = imageResult.response.candidates?.[0].content.parts.find(p => p.inlineData);
          
          if (imagePart && imagePart.inlineData) {
             const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
             await whatsappService.sendImage(from, buffer, `✨ *Generated Image:* "${args.prompt}"`);
             return { status: 'success', message: "Image generated and sent successfully." };
          } else {
             const textResponse = imageResult.response.text();
             return { status: 'error', message: `Oga, I no fit generate that image: ${textResponse}` };
          }
        } catch (genErr: any) {
           if (genErr.message.includes('429')) {
              console.warn(`🔄 [IMAGE FALLBACK] 3.1 Flash-Image Quota Exceeded. Switching to Creative Prompt Fallback...`);
              
              const promptModel = imageGenAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
              const promptResult = await promptModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: `The image generator is busy. Create a stunning, high-quality, professional image generation prompt for this idea: ${args.prompt}. Write it in a way that the user can visualize the result.` }] }]
              });

              const artisticPrompt = promptResult.response.text();
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
