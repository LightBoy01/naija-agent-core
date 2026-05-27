import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_ID = '1189172570934595'; // New Aelixxr Phone ID
const RECIPIENT = SystemConfig.CONTACTS.MASTER_ADMIN_PHONE; // Boss Number

async function testSend() {
  console.log(`🚀 [TEST SEND] Sending message from ${PHONE_ID} to ${RECIPIENT}...`);

  try {
    const url = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: RECIPIENT,
      type: 'text',
      text: { body: "🌿 *AELIXXR SYSTEM CHECK*\n\nOga Boss, if you see this, it means my new number (+2347011925076) is officially LIVE and connected to the Empire! 🚀" }
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    console.log('✅ Message Sent Successfully!');
    console.log('Response ID:', response.data.messages[0].id);
  } catch (error: any) {
    console.error('❌ Send Failed:', error.response?.data || error.message);
  }
}

testSend();
