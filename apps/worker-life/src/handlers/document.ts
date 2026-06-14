import { Job } from 'bullmq';
import { ingestDocument } from '@naija-agent/storage';
import { logger } from '../utils/logger.js'; 
import { WhatsAppService } from '../services/whatsapp.js'; 

export async function handleDocumentIngestion(job: Job, whatsappService: WhatsAppService) {
  const { orgId, from, mediaId, mimeType, caption } = job.data;
  logger.info({ jobId: job.id, orgId, type: 'document' }, 'Processing Document Ingestion');

  try {
    // 1. Download Media
    const { buffer } = await whatsappService.downloadMedia(mediaId);
    
    // 2. Ingest via Centralized Storage Service (Handles Upload, LLM OCR, & DB Save)
    const apiKey = process.env.GEMINI_API_KEY || '';
    const doc = await ingestDocument(from, buffer, mimeType, apiKey, {
      orgId,
      caption,
      originalMediaId: mediaId
    });

    logger.info({ docId: doc.id, orgId, type: doc.type }, 'Document Vaulted Successfully via Service');
    
    // 2.5 Inject into NanoMemory (for Exam Cram/PDFs)
    if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) {
        const { nanoMemory } = await import('../services/nanoMemory.js');
        const chunks = await nanoMemory.ingestDocumentFile(from, orgId, buffer, mimeType, caption || 'Uploaded Document');
        if (chunks > 0) {
            logger.info({ chunks }, '📚 Successfully injected PDF chunks into NanoMemory');
        }
    }

    // 3. Notify User
    const amountStr = doc.extractedData?.amount ? `\nAmount: ${doc.extractedData.amount} ${doc.extractedData.currency || ''}` : '';
    await whatsappService.sendText(from, `✅ *Document Vaulted Securely!*\n\n*${doc.title}*\nCategory: ${doc.type}${amountStr}\n\nI have securely filed this away. You can search for it anytime by asking me (e.g., "Find my GTBank receipts from last week").`);

    return { success: true, docId: doc.id, mediaUrl: doc.storageUrl };

  } catch (error: any) {
    logger.error({ error: error.message }, 'Document Ingestion Failed');
    await whatsappService.sendText(from, "❌ I couldn't read that document clearly or store it. Please try sending it again or check the format.");
    throw error;
  }
}
