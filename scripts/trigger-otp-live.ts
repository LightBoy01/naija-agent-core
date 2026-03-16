import dotenv from 'dotenv';
import { getNotificationQueue } from '../apps/web/lib/queue.js';

dotenv.config();

async function triggerOtpLive() {
  const queue = getNotificationQueue();
  const tenantId = 'test_empire_084';
  
  // These would come from your Meta Developer Portal
  const phoneId = process.env.WHATSAPP_PHONE_ID || '';
  const accessToken = process.env.WHATSAPP_API_TOKEN || '';

  console.log(`🚀 [DASHBOARD SIMULATION] Triggering OTP Relay for ${tenantId}...`);

  await queue.add('request-otp', {
    tenantId,
    phoneId,
    accessToken,
    wabaId: 'MOCK_WABA_ID',
    timestamp: Date.now()
  }, { removeOnComplete: true });

  console.log('✅ Job added to queue. The Worker will now update Firestore and ping the merchant.');
  process.exit(0);
}

triggerOtpLive();
