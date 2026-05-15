import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { whatsappService } from '../../services/whatsapp.js';
import { ingestDocument } from '@naija-agent/storage';
import { lifeMemory } from '../../services/lifeMemory.js';

export const MediaInterceptor: LifeInterceptor = {
  name: 'LifeMediaIngestion',
  execute: async (ctx: LifePipelineContext) => {
    const mediaId = ctx.imageId || ctx.documentId || ctx.audioId;
    
    if (mediaId) {
        // 1. Download Media from WhatsApp
        const { buffer, mimeType } = await whatsappService.downloadMedia(mediaId);
        ctx.mediaBuffer = buffer;
        ctx.mediaMime = mimeType;
        
        // 2. Ingest to Vault (Cloud Storage + Vector Search parsing)
        const doc = await ingestDocument(ctx.userPhone, buffer, mimeType || 'image/jpeg', ctx.apiKey, {
            orgId: ctx.orgId, 
            caption: ctx.message, 
            originalMediaId: mediaId
        });
        
        // 3. Prepare summary for the AI
        ctx.ingestionSummary = `\n\n[SYSTEM UPDATE]: File saved to Vault. Summary: ${doc.summary}`;
        
        // 4. Save to Episodic Memory
        await lifeMemory.saveEpisodicEvent(ctx.userPhone, `Vault: ${doc.type}`, doc.summary || 'Uploaded file', 'neutral');
    }

    return ctx;
  }
};
