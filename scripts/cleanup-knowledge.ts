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

async function cleanupKnowledge() {
  const MASTER_ORG_ID = 'naija-agent-master';
  const keysToDelete = ['admin_pin', 'architecture', 'prd'];

  console.log(`🧹 --- CLEANING MASTER KNOWLEDGE (${MASTER_ORG_ID}) --- 🧹\n`);

  try {
    for (const key of keysToDelete) {
      console.log(`🗑️ Deleting: ${key}...`);
      await db.collection('organizations')
        .doc(MASTER_ORG_ID)
        .collection('knowledge')
        .doc(key)
        .delete();
    }
    console.log('\n✅ Cleanup complete.');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

cleanupKnowledge();
