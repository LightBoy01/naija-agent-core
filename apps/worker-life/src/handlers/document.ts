import { Job } from 'bullmq';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { saveEntity } from '@naija-agent/firebase';
import { logger } from '../utils/logger.js'; 
import { WhatsAppService } from '../services/whatsapp.js'; 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function handleDocumentIngestion(job: Job, whatsappService: WhatsAppService) {
  const { orgId, from, mediaId, mimeType, caption } = job.data;
  logger.info({ jobId: job.id, orgId, type: 'document' }, 'Processing Document Ingestion');

  try {
    // 1. Download Media
    const { buffer } = await whatsappService.downloadMedia(mediaId);
    
    // 2. Gemini Vision Analysis
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `
    Analyze this document/image. Extract the following JSON:
    {
      "summary": "Brief 1-sentence summary of what this is (e.g. Receipt from GTBank)",
      "amount": Number or null,
      "date": "YYYY-MM-DD" or null,
      "sender": "Name of issuer/sender or null",
      "category": "One of [Receipt, Invoice, Contract, ID, Utility, Other]",
      "keywords": ["List", "of", "5-10", "search", "keywords", "related", "to", "content"]
    }
    RETURN JSON ONLY.
    Caption Context: "${caption || ''}"
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: buffer.toString('base64'), mimeType } }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) throw new Error('Failed to parse AI response');
    const metadata = JSON.parse(jsonMatch[0]);

    // 3. Save to Vault
    const docId = await saveEntity(orgId, 'vault', {
      ...metadata,
      mediaId, // In production, upload to Cloud Storage and save URL instead
      mimeType,
      uploadedBy: from,
      caption
    });

    logger.info({ docId, orgId }, 'Document Vaulted Successfully');
    
    // 4. Notify User
    await whatsappService.sendText(from, `✅ *Document Saved!* \n\nI've filed this under *${metadata.category}*.\nSummary: ${metadata.summary}`);

    return { success: true, docId };

  } catch (error: any) {
    logger.error({ error: error.message }, 'Document Ingestion Failed');
    await whatsappService.sendText(from, "❌ I couldn't read that document clearly. Please try again.");
    throw error;
  }
}
