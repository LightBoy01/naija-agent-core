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
const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY;

if (!PAYSTACK_KEY) {
  console.error('❌ PAYSTACK_SECRET_KEY is missing from .env');
  process.exit(1);
}

async function update() {
  console.log(`🌱 Updating Organization: ${ORG_ID} with Per-Tenant Paystack Key...`);

  try {
    const orgRef = db.collection('organizations').doc(ORG_ID);
    const doc = await orgRef.get();
    
    if (!doc.exists) {
      console.error(`❌ Org ${ORG_ID} not found! Run seed-org.ts first.`);
      process.exit(1);
    }

    const currentConfig = doc.data()?.config || {};

    await orgRef.update({
      config: {
        ...currentConfig,
        payment: {
          provider: 'paystack',
          secretKey: PAYSTACK_KEY
        },
        model: 'gemini-2.5-flash',
        adminPhone: process.env.BOSS_PHONE_NUMBER || '2348000000000', // Your number from .env
        adminPin: '1234'
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Organization updated successfully with Payment Config!');
  } catch (error) {
    console.error('❌ Update failed:', error);
  }
}

update();
