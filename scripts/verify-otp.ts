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
const CODE = process.argv[3];

if (!PHONE_ID || !CODE) {
  console.error('Usage: npx tsx scripts/verify-otp.ts <PHONE_ID> <CODE>');
  process.exit(1);
}

async function verifyOtp() {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/verify_code`; // OR register
    // Usually 'register' is used for the first time, 'verify_code' for subsequent?
    // Let's try 'register' as it's more common for setup.
    // Actually, 'register' is the endpoint to verify the code.
    const registerUrl = `https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/register`;
    
    console.log(`Verifying OTP ${CODE} for Phone ID ${PHONE_ID}...`);

    await axios.post(registerUrl, {
      messaging_product: 'whatsapp',
      pin: '123456', // 6-digit PIN for 2FA registration (optional but good practice)
      code: CODE
    }, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('\n✅ Phone Verified & Registered Successfully!');
    console.log('This phone is now ready to send/receive messages.');

  } catch (error: any) {
    console.error('❌ Error verifying OTP:', error.response?.data || error.message);
  }
}

verifyOtp();
