import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function checkPin() {
  const masterDoc = await db.collection('organizations').doc('naija-agent-master').get();
  const pin = masterDoc.data()?.config?.adminPin;
  
  console.log('--- SOVEREIGN PIN STATUS CHECK ---');
  console.log('Org ID: naija-agent-master');
  
  if (!pin) {
    console.log('❌ Result: NO PIN FOUND! Please re-seed the Master Bot.');
  } else if (pin.startsWith('$2b$')) {
    console.log('✅ Result: PIN is SECURE (Hashed with Bcrypt).');
    console.log(`🔒 Hash Length: ${pin.length} chars`);
  } else {
    console.log('⚠️  Result: PIN is INSECURE (Plain Text).');
    console.log(`📏 Length: ${pin.length} digits`);
  }
  
  process.exit(0);
}

checkPin();
