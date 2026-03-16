import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert } from 'firebase-admin/app';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Initialize Firebase
const serviceAccountPath = path.resolve(process.cwd(), 'packages/firebase/serviceAccountKey.json');
let credential;

if (fs.existsSync(serviceAccountPath)) {
  credential = cert(serviceAccountPath);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    const startIndex = raw.indexOf('{');
    const jsonStr = startIndex === -1 ? raw.replace(/[^\x00-\x7F]/g, "") : raw.substring(startIndex).replace(/[^\x00-\x7F]/g, "");
    credential = cert(JSON.parse(jsonStr));
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var');
  }
}

if (!credential) {
  throw new Error('Could not find Firebase credentials');
}

initializeApp({
  credential,
  projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core'
});

const db = getFirestore();

async function run() {
  console.log('📱 Extracting all phone numbers from the database...\n');

  const phones = new Set<string>();

  // 1. Organizations
  const orgs = await db.collection('organizations').get();
  console.log(`--- Organizations (${orgs.size}) ---`);
  for (const orgDoc of orgs.docs) {
    const data = orgDoc.data();
    if (data.config?.adminPhone) {
        phones.add(data.config.adminPhone);
        console.log(`[Org: ${orgDoc.id}] Admin: ${data.config.adminPhone}`);
    }
    if (data.config?.botPhone) {
        phones.add(data.config.botPhone);
        console.log(`[Org: ${orgDoc.id}] Bot: ${data.config.botPhone}`);
    }

    // 2. Staff
    const staff = await orgDoc.ref.collection('staff').get();
    for (const sDoc of staff.docs) {
      const sData = sDoc.data();
      if (sData.phone) {
          phones.add(sData.phone);
          console.log(`[Org: ${orgDoc.id}] Staff: ${sData.phone} (${sData.name})`);
      }
    }
  }

  // 3. Chats (Customers)
  const chats = await db.collection('chats').get();
  console.log(`\n--- Chats/Customers (${chats.size}) ---`);
  for (const chatDoc of chats.docs) {
    const cData = chatDoc.data();
    if (cData.whatsappUserId) {
        phones.add(cData.whatsappUserId);
        console.log(`[Chat: ${chatDoc.id}] Customer: ${cData.whatsappUserId}`);
    }
  }

  console.log(`\n--- Unique Phone Count: ${phones.size} ---`);
  console.log(Array.from(phones).sort().join(', '));
}

run().catch(console.error);
