import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_API_TOKEN;
const WABA_ID = process.env.WHATSAPP_WABA_ID;
const API_VERSION = 'v21.0';

if (!TOKEN || !WABA_ID) {
  console.error('Missing config:', { TOKEN: !!TOKEN, WABA_ID });
  process.exit(1);
}

async function checkSubscriptions() {
  console.log(`📡 Checking Subscribed Apps for WABA ID: ${WABA_ID}...`);
  
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/subscribed_apps`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const apps = response.data.data;
    console.log(`\n✅ Found ${apps.length} Subscribed App(s):`);
    
    if (apps.length > 0) {
      apps.forEach((app: any) => {
        console.log(JSON.stringify(app, null, 2));
      });
    } else {
      console.log('⚠️ No apps are subscribed! You need to subscribe your app to receive webhooks.');
    }

  } catch (error: any) {
    console.error('❌ Check Failed:', error.response?.data || error.message);
  }
}

checkSubscriptions();
