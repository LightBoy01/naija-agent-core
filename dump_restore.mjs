import { getDb as getFirestore } from './packages/firebase/dist/index.js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

function escapeString(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + str.toString().replace(/'/g, "''") + "'";
}

async function dump() {
  const firestore = getFirestore();
  const targetOrgs = ['aelixxr', 'aelixxr-life-companion'];
  let sql = 'BEGIN;\n';

  for (const orgId of targetOrgs) {
    const doc = await firestore.collection('organizations').doc(orgId).get();
    if (!doc.exists) continue;
    const data = doc.data();

    sql += `INSERT INTO organizations (id, name, balance_kobo, is_active, status, region, sector, deployment_model, cost_per_reply, whatsapp_phone_id, timezone, onboarding_step, onboarding_data, system_prompt, config) VALUES (` +
      `${escapeString(doc.id)}, ` +
      `${escapeString(data.name || 'Unknown Org')}, ` +
      `${data.balance || 0}, ` +
      `${data.isActive !== false ? 'true' : 'false'}, ` +
      `${escapeString(data.status || 'ACTIVE')}, ` +
      `${escapeString(data.region || 'NG')}, ` +
      `${escapeString(data.sector || 'commerce')}, ` +
      `${escapeString(data.deploymentModel || 'SHARED')}, ` +
      `${data.costPerReply || 3300}, ` +
      `${escapeString(data.whatsappPhoneId || null)}, ` +
      `${escapeString(data.timezone || 'Africa/Lagos')}, ` +
      `${escapeString(data.onboardingStep || 'COMPLETE')}, ` +
      `${data.onboardingData ? escapeString(JSON.stringify(data.onboardingData)) : 'NULL'}, ` +
      `${escapeString(data.systemPrompt || null)}, ` +
      `${data.config ? escapeString(JSON.stringify(data.config)) : "'{}'"}` +
    `) ON CONFLICT (id) DO NOTHING;\n`;

    const chatsSnap = await firestore.collection('chats').where('organizationId', '==', orgId).get();
    for (const cDoc of chatsSnap.docs) {
      const cData = cDoc.data();
      sql += `INSERT INTO chats (id, org_id, user_phone, user_name, is_opted_out, is_cart_active, summary) VALUES (` +
        `${escapeString(cDoc.id)}, ` +
        `${escapeString(orgId)}, ` +
        `${escapeString(cData.whatsappUserId || null)}, ` +
        `${escapeString(cData.userName || null)}, ` +
        `${cData.isOptedOut || false ? 'true' : 'false'}, ` +
        `${cData.isCartActive || false ? 'true' : 'false'}, ` +
        `${escapeString(cData.summary || null)}` +
      `) ON CONFLICT (id) DO NOTHING;\n`;

      const msgSnap = await firestore.collection('chats').doc(cDoc.id).collection('messages').orderBy('timestamp', 'desc').limit(5000).get();
      for (const mDoc of msgSnap.docs) {
        const mData = mDoc.data();
        sql += `INSERT INTO messages (id, chat_id, role, content, type) VALUES (` +
          `${escapeString(mDoc.id)}, ` +
          `${escapeString(cDoc.id)}, ` +
          `${escapeString(mData.role || 'user')}, ` +
          `${escapeString(mData.content || '')}, ` +
          `${escapeString(mData.type || 'text')}` +
        `) ON CONFLICT (id) DO NOTHING;\n`;
      }
    }
  }
  sql += 'COMMIT;\n';
  fs.writeFileSync('restore.sql', sql);
  console.log('Dump complete! Wrote restore.sql');
  process.exit(0);
}
dump().catch(console.error);
