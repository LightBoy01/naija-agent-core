import axios from 'axios';
import { z } from 'zod';
import crypto from 'crypto';

const WhatsAppSendResponseSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  contacts: z.array(z.object({ input: z.string(), wa_id: z.string() })),
  messages: z.array(z.object({ id: z.string() })),
});

export class WhatsAppService {
  private apiToken: string;
  private phoneId: string;
  private appSecret?: string;
  private version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  private baseUrl = `https://graph.facebook.com/${this.version}`;

  constructor(apiToken: string, phoneId: string, appSecret?: string) {
    this.apiToken = apiToken;
    this.phoneId = phoneId;
    this.appSecret = appSecret;
  }

  private getAuthParams() {
    if (!this.appSecret) return {};
    
    // Generate HMAC-SHA256 proof of the access token using the app secret
    // This proves the request comes from our server, not a stolen token.
    const proof = crypto
      .createHmac('sha256', this.appSecret)
      .update(this.apiToken)
      .digest('hex');
      
    return { appsecret_proof: proof };
  }

  // Send Text Message
  async sendText(to: string, text: string): Promise<string> {
    const body = (text || '').trim();
    if (!body) {
      console.warn('⚠️ [WHATSAPP_SERVICE] Attempted to send empty text. Using fallback.');
    }
    const finalBody = body || "I'm sorry, I couldn't generate a response. Please try again.";

    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: finalBody },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          params: this.getAuthParams(),
        }
      );

      const data = WhatsAppSendResponseSchema.parse(response.data);
      return data.messages[0].id;
    } catch (error: any) {
      console.error('WhatsApp Send Error:', error.response?.data || error.message);
      throw new Error('Failed to send WhatsApp message');
    }
  }

  // Send Image Message
  async sendImage(to: string, imageUrl: string | Buffer, caption?: string): Promise<string> {
    if (Buffer.isBuffer(imageUrl)) {
       // --- UPLOAD TO META (PHASE 7.10) ---
       // For now, we log and throw as we primarily use URLs
       console.error('❌ [WHATSAPP_SERVICE] Buffer uploads not implemented yet. Use a persistent URL.');
       throw new Error('Image Buffer uploads are not yet supported in this version of the service.');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'image',
          image: { 
            link: imageUrl,
            caption: caption 
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          params: this.getAuthParams(),
        }
      );

      const data = WhatsAppSendResponseSchema.parse(response.data);
      return data.messages[0].id;
    } catch (error: any) {
      console.error('WhatsApp Send Image Error:', error.response?.data || error.message);
      throw new Error('Failed to send WhatsApp image');
    }
  }

  // Download Media (Audio/Image)
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      // 1. Get Media URL
      const urlResponse = await axios.get(`${this.baseUrl}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
        params: this.getAuthParams(),
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
      // Note: Meta's media download URL often has its own auth token embedded or requires the header.
      // We append the proof just in case, though usually Authorization header is key.
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
        `${this.baseUrl}/${this.phoneId}/messages`, 
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
          params: this.getAuthParams(),
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
        `${this.baseUrl}/${wabaId}/subscribed_apps`,
        {},
        {
          headers: { Authorization: `Bearer ${this.apiToken}` },
          params: this.getAuthParams(),
        }
      );
      console.log(`✅ WABA ${wabaId} subscribed successfully!`);
      return true;
    } catch (error: any) {
      console.error('❌ WABA Subscription Failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Finalizes SIM registration using the 6-digit OTP code.
   * This is used in the "Remote OTP Relay" workflow.
   */
  async registerNumber(otp: string): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneId}/register`,
        {
          messaging_product: 'whatsapp',
          pin: otp,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          params: this.getAuthParams(),
        }
      );

      console.log(`✅ Phone registration successful for ID: ${this.phoneId}`);
      return response.data.success || true;
    } catch (error: any) {
      const metaError = error.response?.data?.error?.message || error.message;
      console.error(`❌ Phone Registration Failed (${this.phoneId}):`, metaError);
      throw new Error(`Meta Registration Error: ${metaError}`);
    }
  }

  /**
   * Triggers Meta to send a 6-digit verification code to the phone number.
   * (Phase 8: Seamless Onboarding)
   */
  async requestCode(method: 'SMS' | 'VOICE' = 'SMS'): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneId}/request_code`,
        {
          messaging_product: 'whatsapp',
          code_method: method,
          language: 'en_US'
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          params: this.getAuthParams(),
        }
      );
      console.log(`✅ Code requested successfully via ${method} for ID: ${this.phoneId}`);
      return response.data.success || true;
    } catch (error: any) {
      const metaError = error.response?.data?.error?.message || error.message;
      console.error(`❌ Code Request Failed (${this.phoneId}):`, metaError);
      throw new Error(`Meta Code Request Error: ${metaError}`);
    }
  }
}
