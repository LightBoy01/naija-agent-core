import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const WEBHOOK_URL = 'https://naija-agentapi-production.up.railway.app/webhook';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const RECIPIENT_PHONE = '2347042310893'; // Your number

if (!APP_SECRET || !PHONE_ID) {
  console.error('❌ Missing WHATSAPP_APP_SECRET or WHATSAPP_PHONE_ID');
  process.exit(1);
}

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '1234567890',
              phone_number_id: PHONE_ID,
            },
            contacts: [
              {
                profile: {
                  name: 'Naija User',
                },
                wa_id: RECIPIENT_PHONE,
              },
            ],
            messages: [
              {
                from: RECIPIENT_PHONE,
                id: 'wamid.HBgNMjM0NzA0MjMxMDg5MxUCABEYEjkzQzU0OEMyQTA5RjBFNDVFQQA=', // Random ID
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: {
                  body: 'Hello, who are you?',
                },
                type: 'text',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

const payloadString = JSON.stringify(payload);

// Calculate Signature
const signature = crypto
  .createHmac('sha256', APP_SECRET)
  .update(payloadString)
  .digest('hex');

async function sendWebhook() {
  console.log(`🚀 Simulating inbound message from ${RECIPIENT_PHONE} to ${WEBHOOK_URL}...`);
  console.log(`📝 Payload: ${payloadString}`);
  
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${signature}`,
      },
    });

    console.log(`✅ Webhook Response: ${response.status} ${response.statusText}`);
    console.log('👉 Check the Railway logs now to see the processing!');
  } catch (error: any) {
    console.error('❌ Webhook Failed:', error.response?.data || error.message);
  }
}

sendWebhook();
