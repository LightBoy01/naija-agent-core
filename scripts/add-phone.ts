import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WABA_ID = process.env.WHATSAPP_WABA_ID;
const API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const API_VERSION = 'v21.0';

if (!WABA_ID || !API_TOKEN) {
  console.error('Missing WHATSAPP_WABA_ID or WHATSAPP_API_TOKEN in .env');
  process.exit(1);
}

const PHONE_NUMBER = process.argv[2]; // e.g. +234...
const DISPLAY_NAME = process.argv[3]; // e.g. "Naija Agent Master"

if (!PHONE_NUMBER || !DISPLAY_NAME) {
  console.error('Usage: npx tsx scripts/add-phone.ts <PHONE_NUMBER> <DISPLAY_NAME>');
  process.exit(1);
}

async function addPhone() {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/phone_numbers`;
    console.log(`Adding phone ${PHONE_NUMBER} as "${DISPLAY_NAME}" to WABA ${WABA_ID}...`);

    const response = await axios.post(url, {
      cc: '234', // Hardcoded for Nigeria for now, or extract from input
      phone_number: PHONE_NUMBER.replace(/\D/g, '').replace(/^234/, ''), // Remove +234
      display_name: DISPLAY_NAME,
      verified_name: DISPLAY_NAME
    }, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('\n✅ Phone Added Successfully!');
    console.log(`ID: ${response.data.id}`);
    console.log('Next Step: Request OTP using scripts/request-otp.ts <PHONE_ID>');

  } catch (error: any) {
    console.error('❌ Error adding phone:', error.response?.data || error.message);
  }
}

addPhone();
