import { PipelineContext, Interceptor } from '../types.js';
import { uploadMedia } from '@naija-agent/storage';
import { logger } from '../../utils/logger.js';
import fs from 'fs';

export const MediaInterceptor: Interceptor = {
  name: 'BusinessMediaSovereignty',
  execute: async (ctx: PipelineContext) => {
    const { type, content, orgId, from, phoneId } = ctx.job.data;
    
    // Check if job contains media
    if (type === 'audio' || type === 'image' || type === 'document') {
        const mediaId = content.audioId || content.imageId || content.documentId;
        
        let buffer: Buffer | undefined;
        let mimeType = content.mimeType || 'application/octet-stream';

        // 1. Try reading from Sovereign Sidecar Local File
        if (phoneId?.startsWith('baileys-') && content.fileName && fs.existsSync(content.fileName)) {
            try {
                buffer = fs.readFileSync(content.fileName);
                logger.info({ fileName: content.fileName }, '📂 [MEDIA] Loaded media directly from Sidecar cache');
            } catch (e: any) {
                logger.error({ fileName: content.fileName, error: e.message }, '❌ [MEDIA] Failed to read Sidecar media file');
            }
        } 
        // 2. Fallback to legacy WhatsApp Cloud API
        else if (mediaId && ctx.tenantWhatsAppService) {
            try {
                const downloaded = await ctx.tenantWhatsAppService.downloadMedia(mediaId);
                buffer = downloaded.buffer;
                mimeType = downloaded.mimeType;
            } catch (e: any) {
                logger.error({ orgId, mediaId, error: e.message }, '❌ [MEDIA] Failed to download from Meta API');
            }
        }

        // 3. Archive to Long-term Storage (Sovereign OSS)
        if (buffer) {
            try {
                const extension = mimeType.split('/')[1] || 'bin';
                const safeMediaId = mediaId || `sidecar_${Date.now()}`;
                const fileName = `${safeMediaId}_${Date.now()}.${extension}`;
                
                const archivalUrl = await uploadMedia(orgId, fileName, buffer, mimeType, {
                    sender: from,
                    originalMediaId: safeMediaId,
                    purpose: 'archival'
                });

                logger.info({ orgId, safeMediaId, archivalUrl }, '🎞️ [MEDIA SOVEREIGNTY] Media archived permanently.');

                // Attach to context for subsequent interceptors/handlers
                ctx.archivedMediaUrl = archivalUrl;
                ctx.mediaBuffer = buffer;
                ctx.mediaMime = mimeType;

                // Clean up Sidecar temp file
                if (content.fileName && fs.existsSync(content.fileName)) {
                    fs.unlinkSync(content.fileName);
                }
            } catch (e: any) {
                logger.error({ orgId, error: e.message }, '❌ [MEDIA ARCHIVAL] Failed to archive media');
            }
        }
    }

    return ctx;
  }
};
