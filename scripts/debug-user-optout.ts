
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

const serviceAccountPath = path.resolve(__dirname, '../packages/firebase/serviceAccountKey.json');
let serviceAccount;

if (fs.existsSync(serviceAccountPath)) {
  console.log(`📂 Using local service account key: ${serviceAccountPath}`);
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} else {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (serviceAccountBase64) {
    const decoded = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
    const cleanJson = decoded.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
    serviceAccount = JSON.parse(cleanJson);
  } else if (serviceAccountJson) {
    const cleanJson = serviceAccountJson.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
    serviceAccount = JSON.parse(cleanJson);
  }
}

if (!serviceAccount) {
  console.error('❌ Could not find service account via file or environment variables.');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function debugUser(phone: string) {
  const variations = [phone, `+${phone.replace(/^\+/, '')}`];
  console.log(`🔍 Debugging opt-out status for variations: ${variations.join(', ')}`);
  
  for (const p of variations) {
    const snapshot = await db.collection('chats').where('whatsappUserId', '==', p).get();
    
    if (snapshot.empty) {
      console.log(`ℹ️ No chat documents found for variant: ${p}`);
      continue;
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();
      console.log(`---
Chat ID: ${doc.id}
Org ID: ${data.organizationId}
isOptedOut: ${data.isOptedOut}
updatedAt: ${data.updatedAt?.toDate()?.toISOString()}
---`);

      if (data.isOptedOut) {
        console.log(`✅ Fixing: Setting isOptedOut to false for ${doc.id}...`);
        await doc.ref.update({ isOptedOut: false, updatedAt: new Date() });
        console.log('✨ Done.');
      }
    }
  }
}

const userPhone = '2347042310893';
debugUser(userPhone).catch(console.error);
