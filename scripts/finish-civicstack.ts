import dotenv from 'dotenv';
import { getDb } from '@naija-agent/firebase';

dotenv.config();

async function finishCivicStack() {
  const db = await getDb();
  const orgId = 'test_empire_084';
  
  console.log(`🛠️ [MANUAL FINISH] Finalizing setup for ${orgId} (CivicStack)...`);

  try {
    await db.collection('organizations').doc(orgId).update({
      name: 'CivicStack',
      isActive: true,
      onboardingStep: 'COMPLETE',
      'config.bankDetails': {
        bankName: 'Opay',
        accountNumber: '7055229084',
        accountName: 'CivicStack Boss'
      },
      updatedAt: new Date()
    });

    console.log('✅ CivicStack is now 100% LIVE!');
    console.log('👉 Type #status on WhatsApp now!');
  } catch (e: any) {
    console.error('❌ Finish Failed:', e.message);
  }
}

finishCivicStack();
