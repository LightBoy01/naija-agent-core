import dotenv from 'dotenv';
import { activateTenant } from '@naija-agent/firebase';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.ts';

dotenv.config();

async function completeTest() {
  const targetPhone = '2347055229084';
  const tenantId = 'test_empire_084';
  const phoneId = '1055456180990710';
  const token = process.env.WHATSAPP_API_TOKEN || '';

  console.log(`🚀 [FINALIZE TEST] Activating ${tenantId}...`);

  try {
    // 1. Activate in DB
    await activateTenant(tenantId, phoneId, token);
    console.log('✅ Bot Activated in Firestore.');

    // 2. Send Congratulations
    const ws = new WhatsAppService(token, process.env.WHATSAPP_PHONE_ID || '');
    const congratsMsg = `🎊 *CONGRATULATIONS!* 🎊\n\nOga Boss, your Digital Apprentice *Empire Test Shop* is now officially LIVE in the cloud! 🚀\n\nI don hand over control to your new bot. You fit start training am now. \n\n*Action:* Type *#setup* to start!`;
    
    await ws.sendText(targetPhone, congratsMsg);
    console.log(`✅ Celebratory message sent to ${targetPhone}.`);
    
    console.log('\n🏁 Onboarding 3.0 Live Test Complete.');
  } catch (e: any) {
    console.error('❌ Finalization Failed:', e.message);
  }
}

completeTest();
