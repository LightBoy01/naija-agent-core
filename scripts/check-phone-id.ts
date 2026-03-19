import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const API_VERSION = 'v21.0';

if (!API_TOKEN) {
  console.error('Missing WHATSAPP_API_TOKEN');
  process.exit(1);
}

const PHONE_ID = process.argv[2];

if (!PHONE_ID) {
  console.error('Usage: npx tsx scripts/check-phone-id.ts <PHONE_ID>');
  process.exit(1);
}

async function checkPhone() {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}`;
    console.log(`Checking Phone ID: ${PHONE_ID}...`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
      },
    });

    console.log('\n✅ Phone Found!');
    console.log(JSON.stringify(response.data, null, 2));

    // Also check registration status
    const regUrl = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/register`;
    try {
        // GET request to /register endpoint often returns status
        // Actually, we can just check the fields in the main response
        // But let's see if we can get more info.
    } catch (e) {
        // ignore
    }

  } catch (error: any) {
    console.error('❌ Error checking phone:', error.response?.data || error.message);
  }
}

checkPhone();
