import axios from 'axios';
import { z } from 'zod';

const WhatsAppSendResponseSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  contacts: z.array(z.object({ input: z.string(), wa_id: z.string() })),
  messages: z.array(z.object({ id: z.string() })),
});

export class WhatsAppService {
  private apiToken: string;
  private phoneId: string;
  private baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(apiToken: string, phoneId: string) {
    this.apiToken = apiToken;
    this.phoneId = phoneId;
  }

  // Send Text Message
  async sendText(to: string, text: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = WhatsAppSendResponseSchema.parse(response.data);
      return data.messages[0].id;
    } catch (error: any) {
      console.error('WhatsApp Send Error:', error.response?.data || error.message);
      throw new Error('Failed to send WhatsApp message');
    }
  }

  // Download Media (Audio/Image)
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      // 1. Get Media URL
      const urlResponse = await axios.get(`${this.baseUrl}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      const mediaUrl = urlResponse.data.url;
      const mimeType = urlResponse.data.mime_type;
      const fileSize = urlResponse.data.file_size; // Meta API usually returns file_size here

      const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

      // Check size from metadata if available, or fetch headers
      if (fileSize && fileSize > MAX_SIZE_BYTES) {
         throw new Error(`File too large (${fileSize} bytes). Max 5MB.`);
      }

      // 2. Download Binary
      const mediaResponse = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        responseType: 'arraybuffer',
        maxContentLength: MAX_SIZE_BYTES, // Enforce limit at axios level
      });

      return {
        buffer: Buffer.from(mediaResponse.data),
        mimeType: mimeType,
      };
    } catch (error: any) {
      console.error('WhatsApp Download Error:', error.response?.data || error.message);
      if (error.message.includes('maxContentLength')) {
         throw new Error('File too large (exceeded 5MB limit)');
      }
      throw new Error('Failed to download media');
    }
  }

  async sendTemplate(to: string, templateName: string, languageCode: string = 'en_US'): Promise<string> {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v21.0/${this.phoneId}/messages`, // Updated to v21.0
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode
            }
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('WhatsApp Send Template Error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Automates the Webhook Subscription for a WABA.
   * This is the "Glue" that makes Meta send messages to us.
   */
  async subscribeWaba(wabaId: string): Promise<boolean> {
    try {
      await axios.post(
        `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
        {},
        {
          headers: { Authorization: `Bearer ${this.apiToken}` },
        }
      );
      console.log(`✅ WABA ${wabaId} subscribed successfully!`);
      return true;
    } catch (error: any) {
      console.error('❌ WABA Subscription Failed:', error.response?.data || error.message);
      return false;
    }
  }
}
