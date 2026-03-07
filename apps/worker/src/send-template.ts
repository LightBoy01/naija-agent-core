import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const RECIPIENT = '2347042310893'; // 07042310893 in international format

async function main() {
  // Dynamic import to bypass some ESM/TS-Node resolution quirks
  const { WhatsAppService } = await import('./services/whatsapp.js');

  if (!TOKEN || !PHONE_ID) {
    console.error('❌ Error: WHATSAPP_API_TOKEN or WHATSAPP_PHONE_ID is missing.');
    process.exit(1);
  }

  const service = new WhatsAppService(TOKEN, PHONE_ID);

  try {
    console.log(`🚀 Sending Template Message to ${RECIPIENT}...`);
    
    // Using the 'hello_world' template which is pre-approved for all WhatsApp Business Accounts
    const result = await service.sendTemplate(RECIPIENT, 'hello_world', 'en_US');
    
    console.log('✅ Message Sent Successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to send message:', error.response?.data || error.message);
  }
}

main();
