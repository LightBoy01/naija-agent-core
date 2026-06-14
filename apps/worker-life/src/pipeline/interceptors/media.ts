import { LifePipelineContext, LifeInterceptor } from '../types.js';
import { whatsappService } from '../../services/whatsapp.js';
import { ingestDocument } from '@naija-agent/storage';
import { lifeMemory } from '../../services/lifeMemory.js';
import { redactPII } from '../../utils/security.js';

export const MediaInterceptor: LifeInterceptor = {
  name: 'LifeMediaIngestion',
  execute: async (ctx: LifePipelineContext) => {
    const mediaId = ctx.imageId || ctx.documentId || ctx.audioId;
    
    if (mediaId) {
        let buffer: Buffer;
        let mimeType: string = ctx.mediaMime || 'application/octet-stream';

        if (mediaId.startsWith('/tmp/')) {
            const fs = await import('fs/promises');
            buffer = await fs.readFile(mediaId);
            if (mediaId.endsWith('.pdf')) mimeType = 'application/pdf';
            else if (mediaId.endsWith('.jpg') || mediaId.endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (mediaId.endsWith('.mp4')) mimeType = 'video/mp4';
            else if (mediaId.endsWith('.ogg')) mimeType = 'audio/ogg';
        } else {
            // 1. Download Media from WhatsApp
            const dl = await whatsappService.downloadMedia(mediaId);
            buffer = dl.buffer;
            mimeType = dl.mimeType;
        }

        ctx.mediaBuffer = buffer;
        ctx.mediaMime = mimeType;
        
        // PII Scrub the caption before saving
        const safeCaption = ctx.message ? redactPII(ctx.message) : undefined;

        // 2. Transcribe Audio (Groq Whisper)
        if (mimeType.startsWith('audio/')) {
            const { audioService } = await import('../../services/audioService.js');
            const transcription = await audioService.transcribe(buffer, mimeType, mediaId);
            
            if (transcription) {
                // Prepend or inject transcription into the context message
                const oldMsg = ctx.message ? `\nCaption: ${ctx.message}` : '';
                ctx.message = `[🎤 Voice Note Transcription]:\n"${transcription}"${oldMsg}`;
                
                // Clear media buffer so downstream AI doesn't try to process the audio binary again
                ctx.mediaBuffer = null;
                ctx.mediaMime = null;
                ctx.ingestionSummary = `\n\n[SYSTEM UPDATE]: User sent a voice note. Transcribed securely.`;
            } else {
                ctx.ingestionSummary = `\n\n[SYSTEM UPDATE]: User sent a voice note, but transcription failed. Ask them to type it instead.`;
                ctx.mediaBuffer = null;
                ctx.mediaMime = null;
            }
            
            // Note: We still save the raw audio to Vault for record keeping
            const doc = await ingestDocument(ctx.userPhone, buffer, mimeType, ctx.apiKey, {
                orgId: ctx.orgId, 
                caption: safeCaption, 
                originalMediaId: mediaId
            });
            await lifeMemory.saveEpisodicEvent(ctx.userPhone, `Vault: Audio`, 'Voice note saved', 'neutral');
            
            return ctx;
        }

        // 3. For Images/Documents: Ingest to Vault (Cloud Storage + Vector Search parsing)
        const doc = await ingestDocument(ctx.userPhone, buffer, mimeType || 'image/jpeg', ctx.apiKey, {
            orgId: ctx.orgId, 
            caption: safeCaption, 
            originalMediaId: mediaId
        });
        
        // 4. Prepare summary for the AI
        ctx.ingestionSummary = `\n\n[SYSTEM UPDATE]: File saved to Vault. Summary: ${doc.summary}`;
        
        // 5. Save to Episodic Memory
        await lifeMemory.saveEpisodicEvent(ctx.userPhone, `Vault: ${doc.type}`, doc.summary || 'Uploaded file', 'neutral');
    }

    return ctx;
  }
};
