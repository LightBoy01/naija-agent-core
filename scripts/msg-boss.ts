
import dotenv from 'dotenv';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.js';

dotenv.config();

async function main() {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const bossPhone = process.env.MASTER_ADMIN_PHONE;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!token || !phoneId || !bossPhone) {
    console.error('❌ Missing environment variables: WHATSAPP_API_TOKEN, WHATSAPP_PHONE_ID, or MASTER_ADMIN_PHONE');
    process.exit(1);
  }

  console.log(`🤖 Master Bot waking up...`);
  console.log(`📡 Targeting Boss: ${bossPhone}`);

  const service = new WhatsAppService(token, phoneId, appSecret);

  try {
    const message = "Oga Boss, I dey here! The system is active and global expansion is ready. 🌍🚀";
    console.log(`📤 Sending message: "${message}"`);
    const msgId = await service.sendText(bossPhone, message);
    console.log(`✅ Message sent successfully! ID: ${msgId}`);
  } catch (error: any) {
    console.error('❌ Failed to send message:', error.message);
    if (error.response) {
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();
