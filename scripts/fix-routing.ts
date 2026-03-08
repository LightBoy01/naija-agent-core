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

async function fix() {
  console.log('🔧 Fixing Routing Collision...');

  try {
    // 1. Pause the Demo Org by giving it a dummy Phone ID
    await db.collection('organizations').doc('naija-agent-org-001').update({
      whatsappPhoneId: 'DEMO_PAUSED',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Ensure Master Org has the correct active Phone ID
    await db.collection('organizations').doc('naija-agent-master').update({
      whatsappPhoneId: process.env.WHATSAPP_PHONE_ID,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Routing fixed! Your Test Number is now 100% dedicated to the MASTER BOT.');
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fix();
