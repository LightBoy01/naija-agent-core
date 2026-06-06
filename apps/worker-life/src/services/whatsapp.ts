import axios from 'axios';
import { logger } from '../utils/logger.js';

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

    // Route to Go Sidecar if it's an internal Org ID or one of the known Sovereign IDs
    const sovereignIds = ['aelixxr', 'zynux', 'naija-agent-master', '2349015772541', '2347011925076', '1034379023092936'];
    if (targetPhoneId.startsWith('baileys-') || sovereignIds.includes(targetPhoneId) || !/^\d+$/.test(targetPhoneId)) {
        const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:8080';
        // Normalize ID to string name if numeric
        let orgId = targetPhoneId.replace('baileys-', '');
        if (orgId === '2349015772541') orgId = 'aelixxr';
        if (orgId === '2347011925076') orgId = 'zynux';
        if (orgId === '1034379023092936') orgId = 'naija-agent-master';

        try {
            await axios.post(`${sidecarUrl}/send`, {
                orgId,
                to,
                text
            }, {
                headers: { 'X-API-Key': process.env.ADMIN_API_KEY }
            });
            return;
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message }, 'Sidecar WhatsApp Send Failed');
            return;
        }
    }

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
    
    try {
      for (const bubble of bubbles) {
        // Handle ultra-long bubbles (sanity check for 4096 limit)
        const maxLen = 4096;
        const subChunks = [];
        for (let i = 0; i < bubble.length; i += maxLen) {
            subChunks.push(bubble.slice(i, i + maxLen));
        }

        for (const chunk of subChunks) {
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
        }

        // Slight delay between coarse bubbles (500ms)
        if (bubbles.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'WhatsApp Send Failed');
    }
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
}

export const whatsappService = new WhatsAppService(
  process.env.WHATSAPP_API_TOKEN || '',
  process.env.AELIXXR_PHONE_ID || process.env.WHATSAPP_PHONE_ID || '',
  process.env.WHATSAPP_APP_SECRET
);
