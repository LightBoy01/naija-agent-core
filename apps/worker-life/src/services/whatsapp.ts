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

  async sendText(to: string, text: string) {
    // 1. Split into bubbles by double newline (paragraphs) or bullet points
    // This makes the response look like it's being "streamed" by a human.
    const bubbles = text.split(/\n\n+/).filter(b => b.trim() !== "");
    
    try {
      for (const bubble of bubbles) {
        // Handle ultra-long bubbles by splitting them into 4096-char chunks (WhatsApp limit)
        const maxLen = 4096;
        const subChunks = [];
        for (let i = 0; i < bubble.length; i += maxLen) {
            subChunks.push(bubble.slice(i, i + maxLen));
        }

        for (const chunk of subChunks) {
            await axios.post(
              `${this.apiUrl}/${this.phoneNumberId}/messages`,
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

        // Slight delay between bubbles (1 second) to simulate typing
        if (bubbles.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
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
