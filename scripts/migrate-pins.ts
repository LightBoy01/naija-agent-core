import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const firebaseAdmin = (admin as any).default || admin;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!firebaseAdmin.apps.length) {
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function migrate() {
  const ORG_ID = 'naija-agent-master';
  console.log(`🔐 Migrating Org: ${ORG_ID} to Hashed PIN...`);

  try {
    const orgRef = db.collection('organizations').doc(ORG_ID);
    const doc = await orgRef.get();
    
    if (!doc.exists) {
      console.error('❌ Org not found!');
      process.exit(1);
    }

    const data = doc.data();
    const plainPin = data?.config?.adminPin || '0000';

    if (plainPin.startsWith('$2b$')) {
      console.log('✅ PIN is already hashed. Skipping.');
      process.exit(0);
    }

    console.log(`Hashing PIN: ${plainPin}...`);
    const hashedPin = await bcrypt.hash(plainPin, 10);

    await orgRef.update({
      'config.adminPin': hashedPin,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('🚀 SUCCESS: Master PIN has been securely hashed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
