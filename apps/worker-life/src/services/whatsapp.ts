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
    const maxLen = 4096;
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.slice(i, i + maxLen));
    }

    try {
      for (const chunk of chunks) {
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
