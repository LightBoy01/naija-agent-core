import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config();

// Initialize Firebase using the common pattern found in scripts
const serviceAccountPath = path.join(process.cwd(), 'packages/firebase/serviceAccountKey.json');
let credential;

if (fs.existsSync(serviceAccountPath)) {
  credential = admin.credential.cert(serviceAccountPath);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  console.error('❌ Firebase Error: No credentials found.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core',
  });
}

const db = getFirestore();

const STABILIZATION_PHONE = '2347042310893';
const STABILIZATION_BALANCE = 50000; // ₦500.00

async function stabilize() {
  console.log('🛠️ --- MVP STABILIZATION: ORG AUDIT --- 🛠️');
  
  const orgIds = [
    'apex_logistics',
    'bims-gadgets',
    'kyPwEm9iqaf8lokxvSqC',
    'techgadget_hub',
    'bims_gadgets',
    'kudirat_kitchen'
  ];

  for (const id of orgIds) {
    console.log(`🔍 Checking ${id}...`);
    const orgRef = db.collection('organizations').doc(id);
    const doc = await orgRef.get();
    
    if (!doc.exists) {
      console.warn(`⚠️ Org ${id} not found in database. Skipping.`);
      continue;
    }

    const data = doc.data()!;
    const updates: any = {};

    // 1. Fix Missing Admin Phone
    if (!data.config?.adminPhone) {
      console.log(`➕ Adding Admin Phone to ${id}`);
      updates['config.adminPhone'] = STABILIZATION_PHONE;
    }

    // 2. Fix Zero Balance
    if ((data.balance || 0) <= 0) {
      console.log(`💰 Adding ₦500.00 balance to ${id}`);
      updates['balance'] = STABILIZATION_BALANCE;
    }

    // 3. Fix Missing Config Fields
    if (!data.config?.adminPin) {
        updates['config.adminPin'] = '1234';
    }

    if (Object.keys(updates).length > 0) {
      await orgRef.update(updates);
      console.log(`✅ ${id} STABILIZED.`);
    } else {
      console.log(`✅ ${id} is already stable.`);
    }
  }

  console.log('🏁 Stabilization Complete.');
  process.exit(0);
}

stabilize().catch(err => {
  console.error('❌ Stabilization failed:', err);
  process.exit(1);
});
