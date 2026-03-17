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

async function reviewMaster() {
  const MASTER_ORG_ID = 'naija-agent-master';
  console.log(`🧠 --- MASTER BOT KNOWLEDGE REVIEW (${MASTER_ORG_ID}) --- 🧠\n`);

  try {
    const orgDoc = await db.collection('organizations').doc(MASTER_ORG_ID).get();
    if (!orgDoc.exists) {
      console.error('❌ Master Org not found!');
      return;
    }

    const knowledgeSnapshot = await orgDoc.ref.collection('knowledge').get();
    console.log(`🏢 Total Facts: ${knowledgeSnapshot.size}`);

    const knowledge: Record<string, string> = {};
    knowledgeSnapshot.forEach(doc => {
      const data = doc.data();
      knowledge[data.key] = data.content;
      console.log(`\n🔹 [${data.key}]`);
      console.log(`   ${data.content}`);
    });

  } catch (error) {
    console.error('❌ Review failed:', error);
  }
}

reviewMaster();
