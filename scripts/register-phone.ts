import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_ID = '1189172570934595'; // New Aelixxr Phone ID

async function registerPhone() {
  console.log(`📡 [REGISTRATION] Registering Phone ID ${PHONE_ID} for Cloud API...`);

  try {
    const url = `https://graph.facebook.com/v21.0/${PHONE_ID}/register`;
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      pin: '123456' // Standard Empire PIN for 2FA
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    console.log('\n✅ Registration Successful!');
    console.log(response.data);
    console.log('\nNext Step: Run the test script again to verify messaging.');
  } catch (error: any) {
    console.error('❌ Registration Failed:', error.response?.data || error.message);
  }
}

registerPhone();
