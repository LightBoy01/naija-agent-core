import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function diagnosticPing() {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_API_TOKEN;
  const recipient = '2347055229084';

  console.log('📡 --- META API DIAGNOSTIC --- 📡');
  console.log(`Using Phone ID: ${phoneId}`);
  console.log(`Target Recipient: ${recipient}`);

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  
  const data = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'text',
    text: { body: '🚨 TEST PING: If you see this, the Empire connection is LIVE.' }
  };

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('\n✅ META RESPONSE SUCCESS!');
    console.log('Message ID:', response.data.messages[0].id);
    console.log('Full Response:', JSON.stringify(response.data, null, 2));
    console.log('\n👉 If the user STILL has not seen the message, check if the phone number is correctly added to the "Test Numbers" in Meta Portal.');

  } catch (err: any) {
    console.error('\n❌ META API ERROR:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error('Message:', err.message);
    }
  }
}

diagnosticPing();
