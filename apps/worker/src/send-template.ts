import dotenv from 'dotenv';
import path from 'path';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Load .env
dotenv.config({ path: path.join(currentDir, '../../.env') });

const TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
import { SystemConfig } from '@naija-agent/types';
const RECIPIENT = SystemConfig.CONTACTS.MASTER_ADMIN_PHONE; // in international format

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
