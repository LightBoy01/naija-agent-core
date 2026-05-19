import { PipelineContext, Interceptor } from '../types.js';
import { uploadMedia } from '@naija-agent/storage';
import { logger } from '../../utils/logger.js';

export const MediaInterceptor: Interceptor = {
  name: 'BusinessMediaSovereignty',
  execute: async (ctx: PipelineContext) => {
    const { type, content, orgId, from } = ctx.job.data;
    
    // Check if job contains media
    if (type === 'audio' || type === 'image' || type === 'document') {
        const mediaId = content.audioId || content.imageId || content.documentId;
        
        if (mediaId && ctx.tenantWhatsAppService) {
            try {
                // 1. Download Media from WhatsApp
                const { buffer, mimeType } = await ctx.tenantWhatsAppService.downloadMedia(mediaId);
                
                // 2. Archive to Long-term Storage (Sovereign OSS or Fallback)
                const extension = mimeType.split('/')[1] || 'bin';
                const fileName = `${mediaId}_${Date.now()}.${extension}`;
                
                const archivalUrl = await uploadMedia(orgId, fileName, buffer, mimeType, {
                    sender: from,
                    originalMediaId: mediaId,
                    purpose: 'archival'
                });

                logger.info({ orgId, mediaId, archivalUrl }, '🎞️ [MEDIA SOVEREIGNTY] Media archived permanently.');

                // Attach to context for subsequent interceptors/handlers
                (ctx as any).archivedMediaUrl = archivalUrl;
                (ctx as any).mediaBuffer = buffer;
                (ctx as any).mediaMime = mimeType;

            } catch (e: any) {
                logger.error({ orgId, mediaId, error: e.message }, '❌ [MEDIA ARCHIVAL] Failed to archive media');
                // We don't short-circuit here to allow the AI to still try and process the live media ID
            }
        }
    }

    return ctx;
  }
};
