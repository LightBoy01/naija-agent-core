import axios from 'axios';
import { z } from 'zod';
import crypto from 'crypto';
import { parsePhoneNumber } from 'libphonenumber-js';
import { SystemConfig } from '@naija-agent/types';

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

    // --- SOVEREIGN ROUTING ---
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];
    if (this.phoneId.startsWith('baileys-') || sovereignIds.includes(this.phoneId) || !/^\d+$/.test(this.phoneId)) {
       let orgId = this.phoneId.replace('baileys-', '');
       const mapped = (SystemConfig.SOVEREIGN_ID_MAP as Record<string, string>)[orgId];
       if (mapped) orgId = mapped;
       
       await this.sendToSovereign(orgId, to, finalBody);
       return `SOV-${Date.now()}`;
    }

    const maxLen = 4096;
    const chunks = [];
    for (let i = 0; i < finalBody.length; i += maxLen) {
      chunks.push(finalBody.slice(i, i + maxLen));
    }

    let lastMessageId = '';

    try {
      for (const chunk of chunks) {
        const response = await axios.post(
          `${this.baseUrl}/${this.phoneId}/messages`,
          {
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: chunk },
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
        lastMessageId = data.messages[0].id;
      }
      return lastMessageId;
    } catch (error: any) {
      console.error('WhatsApp Send Error:', error.response?.data || error.message);
      throw new Error('Failed to send WhatsApp message');
    }
  }

  /**
   * Uploads a raw image buffer to the Meta Cloud API media endpoint.
   * Returns a media ID that can be used to send the image by reference.
   */
  private async uploadBuffer(buffer: Buffer, mimeType: string): Promise<string> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', buffer, { filename: 'image.jpg', contentType: mimeType });
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);

    const response = await axios.post(
      `${this.baseUrl}/${this.phoneId}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          ...form.getHeaders(),
        },
        params: this.getAuthParams(),
      }
    );

    return response.data.id;
  }

  // Send Image Message
  async sendImage(to: string, imageUrl: string | Buffer, caption?: string): Promise<string> {
    // --- SOVEREIGN ROUTING ---
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];
    if (this.phoneId.startsWith('baileys-') || sovereignIds.includes(this.phoneId) || !/^\d+$/.test(this.phoneId)) {
       let orgId = this.phoneId.replace('baileys-', '');
       const buffer = Buffer.isBuffer(imageUrl) ? imageUrl : null;
       
       if (buffer) {
         // New path: send actual image via sidecar /send-media
         await this.sendMediaToSovereign(orgId, to, buffer, 'image/jpeg', caption || '');
         return `SOV-IMG-${Date.now()}`;
       }
       
       // Fallback: URL-only — send as text (sidecar /send-media not yet available for URLs)
       const text = caption ? `${caption}\n\n${imageUrl}` : `${imageUrl}`;
       await this.sendToSovereign(orgId, to, text);
       return `SOV-IMG-${Date.now()}`;
    }

    let mediaId: string;

    if (Buffer.isBuffer(imageUrl)) {
      mediaId = await this.uploadBuffer(imageUrl, 'image/jpeg');
    }

    try {
      const imagePayload: Record<string, string | undefined> = {};
      if (Buffer.isBuffer(imageUrl)) {
        imagePayload.id = mediaId!;
      } else {
        imagePayload.link = imageUrl;
      }
      if (caption) imagePayload.caption = caption;

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'image',
          image: imagePayload,
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
    // Sovereign routing: sidecar-managed phone IDs
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];
    if (this.phoneId.startsWith('baileys-') || sovereignIds.includes(this.phoneId) || !/^\d+$/.test(this.phoneId)) {
       return this.downloadMediaFromSovereign(mediaId);
    }

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

  /**
   * Dispatches a message to the Sovereign Go Sidecar.
   */
  private async sendToSovereign(orgId: string, to: string, text: string): Promise<void> {
    const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL || 'http://localhost:8080';
    const apiKey = process.env.ADMIN_API_KEY;

    try {
      await axios.post(
        `${sidecarUrl}/send`,
        { orgId, to, text },
        {
          headers: {
            'X-API-Key': apiKey || '',
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (e: any) {
      console.error('❌ [SOVEREIGN SEND] Failed:', e.response?.data || e.message);
      throw new Error(`Failed to dispatch message via Sovereign engine: ${e.message}`);
    }
  }

  /**
   * Dispatches media (image buffer) to the Sovereign Go Sidecar's /send-media endpoint.
   */
  private async sendMediaToSovereign(orgId: string, to: string, buffer: Buffer, mimeType: string, caption: string): Promise<void> {
    const sidecarUrl = process.env.WHATSAPP_SIDECAR_URL || 'http://localhost:8080';
    const apiKey = process.env.ADMIN_API_KEY;
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('orgId', orgId);
    form.append('to', to);
    form.append('caption', caption);
    form.append('file', buffer, { filename: 'image.jpg', contentType: mimeType });

    try {
      await axios.post(`${sidecarUrl}/send-media`, form, {
        headers: {
          'X-API-Key': apiKey || '',
          ...form.getHeaders(),
        },
      });
    } catch (e: any) {
      console.error('❌ [SOVEREIGN SEND MEDIA] Failed:', e.response?.data || e.message);
      throw new Error(`Failed to dispatch media via Sovereign engine: ${e.message}`);
    }
  }

  /**
   * Fetches media from the Sovereign Go Sidecar.
   * Only supports local filesystem path (/tmp/sidecar-media/) from the Go sidecar.
   * Direct HTTP download (/download/ endpoint) is not implemented on the sidecar.
   */
  private async downloadMediaFromSovereign(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (mediaId.startsWith('/tmp/')) {
        try {
            const fs = await import('fs/promises');
            const buffer = await fs.readFile(mediaId);
            let mimeType = 'application/octet-stream';
            if (mediaId.endsWith('.pdf')) mimeType = 'application/pdf';
            else if (mediaId.endsWith('.jpg') || mediaId.endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (mediaId.endsWith('.mp4')) mimeType = 'video/mp4';
            else if (mediaId.endsWith('.ogg')) mimeType = 'audio/ogg';
            
            return { buffer, mimeType };
        } catch (err: any) {
            console.error('❌ [SOVEREIGN DOWNLOAD] Local file read failed:', err.message);
            throw new Error(`Failed to read local media file: ${err.message}`);
        }
    }

    throw new Error('Sovereign download only supports local filesystem paths (/tmp/sidecar-media/). Direct HTTP download is not available.');
  }

  /**
   * Dispatches a Typing Indicator (ChatStateComposing) to the Sovereign Go Sidecar.
   */
  async sendTypingIndicator(to: string): Promise<boolean> {
    const sovereignIds = SystemConfig.SOVEREIGN_IDS as readonly string[];
    if (this.phoneId.startsWith('baileys-') || sovereignIds.includes(this.phoneId) || !/^\d+$/.test(this.phoneId)) {
       let orgId = this.phoneId.replace('baileys-', '');
       const mapped = (SystemConfig.SOVEREIGN_ID_MAP as Record<string, string>)[orgId];
       if (mapped) orgId = mapped;

       const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:8080';
       const apiKey = process.env.ADMIN_API_KEY;
       
       try {
         await axios.post(
           `${sidecarUrl}/typing`,
           { orgId, to },
           {
             headers: {
               'X-API-Key': apiKey || '',
               'Content-Type': 'application/json'
             }
           }
         );
         return true;
       } catch (e: any) {
         console.error('❌ [SOVEREIGN TYPING] Failed:', e.response?.data || e.message);
         return false;
       }
    }
    return false;
  }

  async sendTemplate(to: string, templateName: string, languageCode: string = 'en_US'): Promise<string> {
    // --- SOVEREIGN ROUTING ---
    if (this.phoneId.startsWith('baileys-')) {
       const orgId = this.phoneId.replace('baileys-', '');
       await this.sendToSovereign(orgId, to, `[TEMPLATE: ${templateName}]`);
       return `SOV-TMP-${Date.now()}`;
    }

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

  /**
   * Programmatically adds a phone number to a WABA.
   * This allows "Sovereign Automation" (adding a number without the UI).
   * Note: The Display Name may trigger a review.
   */
  async addPhoneNumber(wabaId: string, phoneNumber: string, displayName: string): Promise<{ phoneId: string }> {
    try {
      const parsed = parsePhoneNumber(phoneNumber, 'NG');
      if (!parsed) throw new Error('Invalid phone number format');

      const cc = parsed.countryCallingCode;
      const national = parsed.nationalNumber;

      const response = await axios.post(
        `${this.baseUrl}/${wabaId}/phone_numbers`,
        {
          cc: cc,
          phone_number: national,
          display_name: displayName,
          verified_name: displayName // Request verified name immediately
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          params: this.getAuthParams(),
        }
      );

      console.log(`✅ Phone Number Added Successfully! ID: ${response.data.id}`);
      return { phoneId: response.data.id };
    } catch (error: any) {
      const metaError = error.response?.data?.error?.message || error.message;
      console.error(`❌ Add Phone Number Failed:`, metaError);
      throw new Error(`Meta Add Number Error: ${metaError}`);
    }
  }
}
