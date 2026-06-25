import axios from 'axios';
import { logger } from '../utils/logger.js';
import { whatsappService } from './whatsapp.js';

/**
 * Proxies an incoming WhatsApp message to the Hermes REST Gateway.
 */
export async function proxyToHermes(userPhone: string, message: string, hermesSessionId?: string, phoneId?: string) {
  try {
    // Determine the URL for the Hermes Gateway on the internal Docker network.
    // Assuming the Coolify service is named `hermes` and exposes port 8000.
    const HERMES_URL = process.env.HERMES_GATEWAY_URL || 'http://hermes:8000';

    logger.info({ userPhone, hermesSessionId }, '🔄 Proxied message to Hermes Gateway.');
    whatsappService.sendTypingIndicator(userPhone).catch(e => logger.warn('Typing ind err'));

    const response = await axios.post(`${HERMES_URL}/v1/chat/completions`, {
      messages: [{ role: 'user', content: message }],
      session_id: hermesSessionId,
      // Hermes might need the user's phone to identify the session
      user_id: userPhone
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000 // Hermes might take a while to think/use tools
    });

    const reply = response.data?.choices?.[0]?.message?.content;
    const newSessionId = response.data?.session_id || hermesSessionId;

    if (reply) {
      await whatsappService.sendText(userPhone, reply, phoneId);
    } else {
      await whatsappService.sendText(userPhone, "Hermes didn't say anything back. 😶", phoneId);
    }

    return { success: true, newSessionId };
  } catch (error: any) {
    logger.error({ error: error.message, data: error.response?.data }, '❌ Failed to proxy message to Hermes Gateway');
    await whatsappService.sendText(userPhone, "Ah! Hermes is currently sleeping or unreachable. Please try again later.", phoneId);
    return { success: false };
  }
}
