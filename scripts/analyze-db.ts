import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function analyze() {
  console.log('📊 --- NAIJA AGENT CORE: DATABASE ANALYSIS --- 📊\n');

  try {
    const orgsSnapshot = await db.collection('organizations').get();
    console.log(`🏢 Total Organizations: ${orgsSnapshot.size}`);

    for (const orgDoc of orgsSnapshot.docs) {
      const org = orgDoc.data();
      console.log(`\n--- Org: ${org.name || orgDoc.id} [${orgDoc.id}] ---`);
      console.log(`   Phone ID: ${org.whatsappPhoneId}`);
      console.log(`   Balance:  ₦${(org.balance / 100).toFixed(2)} (${org.balance} kobo)`);
      console.log(`   Role:     ${org.config?.isMaster ? '👑 MASTER (Sovereign)' : '💼 TENANT'}`);
      console.log(`   Admin:    ${org.config?.adminPhone || 'None'}`);

      // Sub-collection: Knowledge
      const knowledgeSnapshot = await orgDoc.ref.collection('knowledge').get();
      console.log(`   🧠 Knowledge Base: ${knowledgeSnapshot.size} facts`);

      // Sub-collection: Activities
      const activitiesSnapshot = await orgDoc.ref.collection('activities').get();
      console.log(`   📅 Total Activities: ${activitiesSnapshot.size}`);

      // Global Chats filtered by this Org
      const chatsSnapshot = await db.collection('chats').where('organizationId', '==', orgDoc.id).get();
      console.log(`   💬 Active Chats:    ${chatsSnapshot.size}`);
      
      // Check for Opt-outs
      const optedOutCount = chatsSnapshot.docs.filter(d => d.data().isOptedOut).length;
      if (optedOutCount > 0) {
        console.log(`   🚫 Opted-out Users: ${optedOutCount}`);
      }
    }

    console.log('\n✅ Analysis Complete.');
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

analyze();
