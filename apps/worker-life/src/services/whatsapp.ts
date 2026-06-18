import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger.js';
import { SystemConfig } from '@naija-agent/types';

function isRetryableError(error: AxiosError): boolean {
    const code = error.code;
    const status = error.response?.status;
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EPIPE') return true;
    if (status && status >= 500) return true;
    return false;
}

async function sendWithRetry(fn: () => Promise<void>, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await fn();
            return;
        } catch (error: any) {
            const isRetryable = error.isAxiosError ? isRetryableError(error as AxiosError) : true;
            if (!isRetryable || attempt === maxRetries - 1) throw error;
            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            logger.warn({ attempt: attempt + 1, delay, code: error.code, status: error.response?.status }, 'WhatsApp send retry');
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

export class WhatsAppService {
  private apiUrl: string;

  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private appSecret?: string
  ) {
    this.apiUrl = `https://graph.facebook.com/v21.0`;
  }

  async sendText(to: string, text: string, optionalPhoneId?: string) {
    const targetPhoneId = optionalPhoneId || this.phoneNumberId;

    // 1. Logic: Group paragraphs into coarser "Coarse Bubbles" (Approx 800 chars)
    // This prevents notification fatigue while still chunking long answers.
    const paragraphs = text.split(/\n\n+/);
    const bubbles: string[] = [];
    let currentBubble = "";

    for (const p of paragraphs) {
        if ((currentBubble.length + p.length) < 800) {
            currentBubble += (currentBubble ? "\n\n" : "") + p;
        } else {
            if (currentBubble) bubbles.push(currentBubble);
            currentBubble = p;
        }
    }
    if (currentBubble) bubbles.push(currentBubble);

    // Route to Go Sidecar if it's an internal Org ID or one of the known Sovereign IDs
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];
    if (targetPhoneId.startsWith('baileys-') || sovereignIds.includes(targetPhoneId) || !/^\d+$/.test(targetPhoneId)) {
        const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:8080';
        // Normalize ID to string name if numeric
        let orgId = targetPhoneId.replace('baileys-', '');
        const mapped = (SystemConfig.SOVEREIGN_ID_MAP as Record<string, string>)[orgId];
        if (mapped) orgId = mapped;
        if (orgId === 'aelixxr') orgId = 'aelixxr-life-companion';

        try {
            for (const bubble of bubbles) {
                await sendWithRetry(async () => {
                    await axios.post(`${sidecarUrl}/send`, {
                        orgId,
                        to,
                        text: bubble
                    }, {
                        headers: { 'X-API-Key': process.env.ADMIN_API_KEY }
                    });
                });
                
                // Slight delay between coarse bubbles (500ms)
                if (bubbles.length > 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            return;
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message }, 'Sidecar WhatsApp Send Failed after retries');
            return;
        }
    }
    
    try {
      for (const bubble of bubbles) {
        // Handle ultra-long bubbles (sanity check for 4096 limit)
        const maxLen = 4096;
        const subChunks = [];
        for (let i = 0; i < bubble.length; i += maxLen) {
            subChunks.push(bubble.slice(i, i + maxLen));
        }

        for (const chunk of subChunks) {
            await sendWithRetry(async () => {
                await axios.post(
                  `${this.apiUrl}/${targetPhoneId}/messages`,
                  {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'text',
                    text: { body: chunk },
                  },
                  { headers: { Authorization: `Bearer ${this.accessToken}` } }
                );
            });
        }

        // Slight delay between coarse bubbles (500ms)
        if (bubbles.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'WhatsApp Send Failed after retries');
    }
  }

  /**
   * Dispatches a Typing Indicator (ChatStateComposing) to the Sovereign Go Sidecar.
   */
  async sendTypingIndicator(to: string): Promise<boolean> {
    const targetPhoneId = this.phoneNumberId;
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];
    
    if (targetPhoneId.startsWith('baileys-') || sovereignIds.includes(targetPhoneId) || !/^\d+$/.test(targetPhoneId)) {
        let orgId = targetPhoneId.replace('baileys-', '');
        const mapped = (SystemConfig.SOVEREIGN_ID_MAP as Record<string, string>)[orgId];
        if (mapped) orgId = mapped;
        if (orgId === 'aelixxr') orgId = 'aelixxr-life-companion';

        const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:8080';
        try {
            await axios.post(`${sidecarUrl}/typing`, {
                orgId,
                to
            }, {
                headers: { 'X-API-Key': process.env.ADMIN_API_KEY }
            });
            return true;
        } catch (error: any) {
            logger.warn({ error: error.response?.data || error.message }, 'Sidecar Typing Failed');
            return false;
        }
    }
    return false;
  }

  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      // 1. Get Media URL
      const metadata = await axios.get(`${this.apiUrl}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      const mediaUrl = metadata.data.url;
      const mimeType = metadata.data.mime_type;

      // 2. Download Binary
      const response = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        responseType: 'arraybuffer',
      });

      return { buffer: Buffer.from(response.data), mimeType };
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'Media Download Failed');
      throw new Error('Failed to download media from WhatsApp');
    }
  }

  async sendImage(to: string, imageUrl: string | Buffer, caption?: string, optionalPhoneId?: string): Promise<string> {
    const targetPhoneId = optionalPhoneId || this.phoneNumberId;
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];

    if (targetPhoneId.startsWith('baileys-') || sovereignIds.includes(targetPhoneId) || !/^\d+$/.test(targetPhoneId)) {
      let orgId = targetPhoneId.replace('baileys-', '');
      const mapped = (SystemConfig.SOVEREIGN_ID_MAP as Record<string, string>)[orgId];
      if (mapped) orgId = mapped;
      if (orgId === 'aelixxr') orgId = 'aelixxr-life-companion';

      if (Buffer.isBuffer(imageUrl)) {
        await this.sendMediaToSidecar(orgId, to, imageUrl, 'image/jpeg', caption || '');
        return `AELX-IMG-${Date.now()}`;
      }

      const text = caption ? `${caption}\n\n${imageUrl}` : `${imageUrl}`;
      await this.sendText(to, text, targetPhoneId);
      return `AELX-IMG-${Date.now()}`;
    }

    if (Buffer.isBuffer(imageUrl)) {
      const mediaId = await this.uploadToMeta(imageUrl, 'image/jpeg');
      await axios.post(
        `${this.apiUrl}/${targetPhoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'image',
          image: { id: mediaId, caption },
        },
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
      return mediaId;
    }

    const response = await axios.post(
      `${this.apiUrl}/${targetPhoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { link: imageUrl, caption },
      },
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    return response.data.messages?.[0]?.id || `AELX-IMG-${Date.now()}`;
  }

  private async uploadToMeta(buffer: Buffer, mimeType: string): Promise<string> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', buffer, { filename: 'image.jpg', contentType: mimeType });
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);

    const response = await axios.post(
      `${this.apiUrl}/${this.phoneNumberId}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...form.getHeaders(),
        },
      }
    );
    return response.data.id;
  }

  private async sendMediaToSidecar(orgId: string, to: string, buffer: Buffer, mimeType: string, caption: string): Promise<void> {
    const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:8080';
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('orgId', orgId);
    form.append('to', to);
    form.append('caption', caption);
    form.append('file', buffer, { filename: 'image.jpg', contentType: mimeType });

    await axios.post(`${sidecarUrl}/send-media`, form, {
      headers: {
        'X-API-Key': process.env.ADMIN_API_KEY || '',
        ...form.getHeaders(),
      },
    });
  }
}

export const whatsappService = new WhatsAppService(
  process.env.WHATSAPP_API_TOKEN || '',
  process.env.AELIXXR_PHONE_ID || process.env.WHATSAPP_PHONE_ID || '',
  process.env.WHATSAPP_APP_SECRET
);
