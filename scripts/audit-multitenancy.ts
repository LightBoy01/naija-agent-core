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

async function audit() {
  console.log(`🔎 Auditing Organization: ${ORG_ID} for Multi-Tenancy...`);

  try {
    const doc = await db.collection('organizations').doc(ORG_ID).get();
    
    if (!doc.exists) {
      console.error('❌ Org not found!');
      return;
    }

    const data = doc.data();
    console.log('--- Organization Data ---');
    console.log('ID:', doc.id);
    console.log('Name:', data?.name);
    console.log('Phone ID:', data?.whatsappPhoneId);
    console.log('Config:', JSON.stringify(data?.config, null, 2));
    
    // Check for sensitive key isolation
    if (data?.config?.payment?.secretKey) {
       console.log('✅ Isolation Check: Payment Secret Key is present in Firestore.');
       const maskedKey = data.config.payment.secretKey.substring(0, 7) + '...';
       console.log('   Key (Masked):', maskedKey);
    } else {
       console.warn('⚠️ Isolation Warning: No Payment Secret Key found in Firestore for this org.');
    }

    if (data?.config?.model) {
       console.log('✅ Isolation Check: Custom Model is set:', data.config.model);
    }

  } catch (error) {
    console.error('❌ Audit failed:', error);
  }
}

audit();
