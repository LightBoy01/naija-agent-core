import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

if (!serviceAccount) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function migrateCurrency() {
  console.log("Starting currency migration...");
  const orgsRef = db.collection('organizations');
  const snapshot = await orgsRef.get();

  let migrated = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.currency || !data.currency.code || !data.currency.locale) {
      await doc.ref.update({
        currency: {
          code: 'NGN',
          symbol: '₦',
          locale: 'en-NG',
          rate: 1.0
        }
      });
      migrated++;
      console.log(`Migrated org: ${doc.id}`);
    }
  }

  console.log(`Migration complete. Updated ${migrated} organizations.`);
}

migrateCurrency().catch(console.error);