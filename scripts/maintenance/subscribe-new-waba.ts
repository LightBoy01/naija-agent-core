import axios from 'axios';

const WABA_ID = '814809477680902';
const TOKEN = process.env.WHATSAPP_API_TOKEN;

async function main() {
  console.log(`📡 Subscribing App to WABA ID: ${WABA_ID}...`);

  if (!TOKEN) {
    console.error('❌ Error: WHATSAPP_API_TOKEN is missing!');
    return;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${WABA_ID}/subscribed_apps`,
      {},
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    console.log('✅ Subscription Successful!');
    console.log('Response:', response.data);
  } catch (error: any) {
    console.error('❌ Subscription Failed:', error.response?.data || error.message);
  }
}

main();
