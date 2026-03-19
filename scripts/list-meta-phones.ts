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

async function listPhones() {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/phone_numbers`;
    console.log(`Fetching phones from: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('\n--- WABA Phone Numbers ---');
    const phones = response.data.data;
    console.log(`Total returned: ${phones.length}`);
    if (response.data.paging) {
      console.log('Pagination:', JSON.stringify(response.data.paging, null, 2));
    }
    
    if (phones.length === 0) {
      console.log('No phones found.');
    } else {
      phones.forEach((p: any) => {
        console.log(`\nDisplay Name: ${p.display_phone_number}`);
        console.log(`ID: ${p.id}`);
        console.log(`Verified Name: ${p.verified_name}`);
        console.log(`Quality Rating: ${p.quality_rating}`);
        console.log(`Status: ${p.code_verification_status || 'UNKNOWN'}`); // e.g. VERIFIED
      });
    }

  } catch (error: any) {
    console.error('Error fetching phones:', error.response?.data || error.message);
  }
}

listPhones();
