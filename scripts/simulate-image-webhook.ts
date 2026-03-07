import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:3000/webhook';
const SECRET = process.env.WHATSAPP_APP_SECRET || 'test_secret';

// Mock Image Payload
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
              phone_number_id: '1234567890',
            },
            contacts: [{ profile: { name: 'Simulated User' }, wa_id: '2348000000000' }],
            messages: [
              {
                from: '2348000000000',
                id: 'wamid.HBgMkBZQc1i3bK9jXd',
                timestamp: Date.now().toString(),
                type: 'image',
                image: {
                  mime_type: 'image/jpeg',
                  sha: 'some_sha_string',
                  id: 'MEDIA_ID_12345',
                  caption: 'Is this news real?',
                },
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

const body = JSON.stringify(payload);

// Calculate Signature
const signature = crypto
  .createHmac('sha256', SECRET)
  .update(body)
  .digest('hex');

console.log('🚀 Sending Simulated Image Webhook...');
console.log(`Payload: ${body}`);

axios
  .post(API_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${signature}`,
    },
  })
  .then((res) => {
    console.log(`✅ Success: ${res.status} ${res.data}`);
  })
  .catch((err) => {
    console.error(`❌ Error: ${err.response?.status} ${err.response?.data}`);
  });
