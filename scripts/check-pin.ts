import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Fix for ESM/CJS interop for firebase-admin
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

async function checkPin() {
  const masterDoc = await db.collection('organizations').doc('naija-agent-master').get();
  const pin = masterDoc.data()?.config?.adminPin;
  
  console.log('--- PIN STATUS CHECK ---');
  console.log('Org ID: naija-agent-master');
  console.log('Current PIN:', pin);
  
  if (pin && pin.startsWith('$2b$')) {
    console.log('✅ Result: PIN is already SECURE (Hashed with Bcrypt).');
  } else {
    console.log('❌ Result: PIN is still INSECURE (Plain Text)!');
  }
  
  process.exit(0);
}

checkPin();
