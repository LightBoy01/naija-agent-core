import { getDb as getFirestore } from './packages/firebase/dist/index.js';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres('postgresql://naija_admin:sovereign_pass@127.0.0.1:5432/naija_ledger');

async function restore() {
  const firestore = getFirestore();
  const targetOrgs = ['aelixxr', 'aelixxr-life-companion'];

  for (const orgId of targetOrgs) {
    const doc = await firestore.collection('organizations').doc(orgId).get();
    if (!doc.exists) continue;
    const data = doc.data();

    await sql`
      INSERT INTO organizations (id, name, balance_kobo, is_active, status, region, sector, deployment_model, cost_per_reply, whatsapp_phone_id, timezone, onboarding_step, onboarding_data, system_prompt, config)
      VALUES (
        ${doc.id},
        ${data.name || 'Unknown Org'},
        ${data.balance || 0},
        ${data.isActive !== false},
        ${data.status || 'ACTIVE'},
        ${data.region || 'NG'},
        ${data.sector || 'commerce'},
        ${data.deploymentModel || 'SHARED'},
        ${data.costPerReply || 3300},
        ${data.whatsappPhoneId || null},
        ${data.timezone || 'Africa/Lagos'},
        ${data.onboardingStep || 'COMPLETE'},
        ${data.onboardingData ? JSON.stringify(data.onboardingData) : null},
        ${data.systemPrompt || null},
        ${data.config ? JSON.stringify(data.config) : '{}'}
      ) ON CONFLICT (id) DO NOTHING;
    `;
    console.log(`Restored org ${orgId}`);

    // chats
    const chatsSnap = await firestore.collection('chats').where('organizationId', '==', orgId).get();
    for (const cDoc of chatsSnap.docs) {
      const cData = cDoc.data();
      await sql`
        INSERT INTO chats (id, org_id, user_phone, user_name, is_opted_out, is_cart_active, summary)
        VALUES (
          ${cDoc.id},
          ${orgId},
          ${cData.whatsappUserId || null},
          ${cData.userName || null},
          ${cData.isOptedOut || false},
          ${cData.isCartActive || false},
          ${cData.summary || null}
        ) ON CONFLICT (id) DO NOTHING;
      `;

      const msgSnap = await firestore.collection('chats').doc(cDoc.id).collection('messages').orderBy('timestamp', 'desc').limit(5000).get();
      for (const mDoc of msgSnap.docs) {
        const mData = mDoc.data();
        await sql`
          INSERT INTO messages (id, chat_id, role, content, type)
          VALUES (
            ${mDoc.id},
            ${cDoc.id},
            ${mData.role || 'user'},
            ${mData.content || ''},
            ${mData.type || 'text'}
          ) ON CONFLICT (id) DO NOTHING;
        `;
      }
    }
  }
  console.log('Restore complete!');
  process.exit(0);
}
restore().catch(console.error);
