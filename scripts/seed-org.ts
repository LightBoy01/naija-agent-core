import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ serviceAccountKey.json not found!');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

const ORG_ID = 'naija-agent-org-001';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

if (!PHONE_ID) {
  console.error('❌ WHATSAPP_PHONE_ID is missing from .env');
  process.exit(1);
}

async function seed() {
  console.log(`🌱 Seeding Organization: ${ORG_ID} with Phone ID: ${PHONE_ID}...`);

  try {
    await db.collection('organizations').doc(ORG_ID).set({
      name: 'Naija Agent Demo Org',
      whatsappPhoneId: PHONE_ID,
      isActive: true,
      systemPrompt: "You are Naija Agent, a helpful and witty AI assistant for Nigerians. You speak in a mix of English and Pidgin English. You are helpful, respectful, and efficient.",
      config: {
        tools: ['web_search', 'calculator']
      },
      balance: 500000, // 5000.00 NGN
      currency: 'NGN',
      costPerReply: 2000, // 20.00 NGN
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Organization seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
}

seed();
