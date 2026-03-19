import { WhatsAppService } from '../apps/worker/src/services/whatsapp';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TO = process.env.MASTER_ADMIN_PHONE; // Boss Phone

if (!TOKEN || !PHONE_ID || !TO) {
  console.error('Missing config:', { TOKEN: !!TOKEN, PHONE_ID, TO });
  process.exit(1);
}

async function run() {
  console.log(`🚀 Sending test message from ${PHONE_ID} to ${TO}...`);
  const wa = new WhatsAppService(TOKEN, PHONE_ID);
  
  try {
    const res = await wa.sendText(TO, "🔔 *Naija Agent System Check*\n\nMaster Bot is now ONLINE on this number.\n\nTime: " + new Date().toLocaleTimeString());
    console.log('✅ Message Sent! ID:', res);
  } catch (e: any) {
    console.error('❌ Failed:', e.message);
  }
}

run();
