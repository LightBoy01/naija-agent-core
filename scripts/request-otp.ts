import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const API_VERSION = 'v21.0';

if (!API_TOKEN) {
  console.error('Missing WHATSAPP_API_TOKEN in .env');
  process.exit(1);
}

const PHONE_ID = process.argv[2];
const METHOD = process.argv[3] || 'SMS'; // SMS or VOICE

if (!PHONE_ID) {
  console.error('Usage: npx tsx scripts/request-otp.ts <PHONE_ID> [SMS|VOICE]');
  process.exit(1);
}

async function requestOtp() {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/request_code`;
    console.log(`Requesting OTP via ${METHOD} for Phone ID ${PHONE_ID}...`);

    await axios.post(url, {
      code_method: METHOD,
      language: 'en_US'
    }, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('\n✅ OTP Requested Successfully!');
    console.log('Check the phone for the 6-digit code.');
    console.log('Next Step: Verify OTP using scripts/verify-otp.ts <PHONE_ID> <CODE>');

  } catch (error: any) {
    console.error('❌ Error requesting OTP:', error.response?.data || error.message);
  }
}

requestOtp();
