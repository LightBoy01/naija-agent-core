import dotenv from 'dotenv';
import { getDb } from '@naija-agent/firebase';

dotenv.config();

async function fixRouting() {
  const db = await getDb();
  const phone = '2347055229084';
  const newOrgId = 'test_empire_084';
  const masterOrgId = 'naija-agent-master';

  console.log(`🛠️ [FIX ROUTING] Re-routing ${phone} from ${masterOrgId} to ${newOrgId}...`);

  try {
    // 1. Delete old session context if it exists
    await db.collection('chats').doc(`${masterOrgId}_${phone}`).delete();
    console.log('✅ Old Master session cleared.');

    // 2. Create New Session Context
    await db.collection('chats').doc(`${newOrgId}_${phone}`).set({
      organizationId: newOrgId,
      whatsappUserId: phone,
      userName: 'Empire Boss',
      lastMessageAt: new Date(),
      status: 'ACTIVE',
      createdAt: new Date()
    });
    console.log('✅ New Empire session created.');

    console.log('\n👉 NOW type #status on WhatsApp!');
  } catch (e: any) {
    console.error('❌ Routing Fix Failed:', e.message);
  }
}

fixRouting();
