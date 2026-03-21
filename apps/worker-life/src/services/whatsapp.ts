import axios from 'axios';
import { logger } from '../utils/logger.js';

export class WhatsAppService {
  private token: string;
  private phoneId: string;
  private version = 'v21.0';

  constructor() {
    this.token = process.env.WHATSAPP_API_TOKEN || '';
    this.phoneId = process.env.WHATSAPP_PHONE_ID || '';
    
    if (!this.token || !this.phoneId) {
        logger.warn('⚠️ WhatsApp API Token or Phone ID missing in Life Worker.');
    }
  }

  async sendText(to: string, body: string): Promise<void> {
    try {
      const url = `https://graph.facebook.com/${this.version}/${this.phoneId}/messages`;
      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to: to,
          text: { body: body },
        },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      logger.info({ to }, '📨 Sent WhatsApp Reply');
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, '❌ Failed to send WhatsApp message');
    }
  }
}

export const whatsappService = new WhatsAppService();
