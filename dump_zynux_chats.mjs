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
  let sql = 'BEGIN;\n';

  const chatsSnap = await firestore.collection('chats').where('organizationId', '==', 'naija-agent-master').get();
  for (const cDoc of chatsSnap.docs) {
    const cData = cDoc.data();
    sql += `INSERT INTO chats (id, org_id, user_phone, user_name, is_opted_out, is_cart_active, summary) VALUES (` +
      `${escapeString(cDoc.id)}, ` +
      `'zynux', ` + // Remap to zynux!
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
  
  sql += 'COMMIT;\n';
  fs.writeFileSync('restore_zynux_chats.sql', sql);
  console.log('Dump complete! Wrote restore_zynux_chats.sql');
  process.exit(0);
}
dump().catch(console.error);
