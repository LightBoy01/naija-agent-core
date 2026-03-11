import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Fix for firebase-admin
const firebaseAdmin = (admin as any).default || admin;

if (!firebaseAdmin.apps.length) {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function deepAudit() {
  console.log('🕵️ --- NAIJA AGENT CORE: DEEP DATA AUDIT --- 🕵️\n');

  try {
    const orgsSnapshot = await db.collection('organizations').get();
    
    for (const orgDoc of orgsSnapshot.docs) {
      const org = orgDoc.data();
      const orgId = orgDoc.id;
      console.log(`\n====================================================`);
      console.log(`🏢 ORGANIZATION: ${org.name || orgId} (${orgId})`);
      console.log(`💰 Balance: ₦${((org.balance || 0) / 100).toLocaleString()}`);
      console.log(`🤖 Role: ${org.config?.isMaster ? '👑 MASTER' : '💼 TENANT'}`);
      console.log(`====================================================`);

      // 🧠 KNOWLEDGE BASE REVIEW
      console.log(`\n🧠 [KNOWLEDGE BASE]`);
      const knowledgeSnapshot = await orgDoc.ref.collection('knowledge').get();
      if (knowledgeSnapshot.empty) {
        console.log('   (Empty)');
      } else {
        knowledgeSnapshot.forEach(doc => {
          const k = doc.data();
          const preview = k.content.length > 100 ? k.content.substring(0, 100) + '...' : k.content;
          console.log(`   - ${k.key}: ${preview}`);
        });
      }

      // 💬 CHAT HISTORY REVIEW
      console.log(`\n💬 [RECENT CHATS]`);
      // Simpler query to avoid index requirement
      const chatsSnapshot = await db.collection('chats')
        .where('organizationId', '==', orgId)
        .get();

      if (chatsSnapshot.empty) {
        console.log('   (No active chats)');
      } else {
        // Manual sort by lastMessageAt
        const sortedChats = chatsSnapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .sort((a, b) => (b.lastMessageAt?.toMillis() || 0) - (a.lastMessageAt?.toMillis() || 0))
          .slice(0, 3);

        for (const chat of sortedChats) {
          console.log(`\n   👤 User: ${chat.userName} (${chat.whatsappUserId})`);
          console.log(`   🕒 Last Message: ${chat.lastMessageAt?.toDate().toLocaleString()}`);
          
          // Peek into messages
          const msgsSnapshot = await db.collection('chats').doc(chat.id).collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(3)
            .get();
          
          const msgs = msgsSnapshot.docs.map(d => d.data()).reverse();
          msgs.forEach((m: any) => {
            const role = m.role || 'unknown';
            const content = m.content || '(Media)';
            console.log(`     [${role.toUpperCase()}]: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`);
          });
        }
      }
    }

    console.log('\n✅ Deep Audit Complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

deepAudit();
