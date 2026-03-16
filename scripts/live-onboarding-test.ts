import dotenv from 'dotenv';
import { registerTrialInterest } from '@naija-agent/firebase';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.js';

dotenv.config();

async function liveOnboardingTest() {
  const targetPhone = '2347055229084';
  const shopId = 'test_empire_084';
  const shopName = 'Empire Test Shop';

  console.log(`🚀 [LIVE TEST] Registering interest for ${targetPhone}...`);

  try {
    // 1. Register Interest (Step 1)
    await registerTrialInterest({
      id: shopId,
      name: shopName,
      adminPhone: targetPhone,
      botPhone: '234000TEST000' 
    });
    console.log('✅ Interest Registered in Firestore.');

    // 2. Simulate Dashboard "Ignite" (Step 2)
    const masterWhatsApp = new WhatsAppService(
      process.env.WHATSAPP_API_TOKEN || '',
      process.env.WHATSAPP_PHONE_ID || '',
      process.env.WHATSAPP_APP_SECRET
    );

    const relayMsg = `📢 *ACTIVATION READY*\n\nOga Boss is ready to move your bot *${shopName}* to the cloud.\n\nPlease type *READY* to receive your 5-minute activation code. Once you see the 6-digit code, just send it here!`;
    
    console.log(`📡 [LIVE TEST] Sending Handover message to ${targetPhone}...`);
    try {
      const result = await masterWhatsApp.sendText(targetPhone, relayMsg);
      console.log('\n✨ SUCCESS! The "Handover" message has been sent.');
      console.log(`The number ${targetPhone} should now see the activation instructions.`);
    } catch (sendErr: any) {
      console.error('\n❌ Meta API Error:', sendErr.message);
      if (sendErr.response?.data) {
        console.error('Details:', JSON.stringify(sendErr.response.data, null, 2));
      }
    }

  } catch (e: any) {
    console.error('❌ Test Failed:', e.message);
  }
}

liveOnboardingTest();
