import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert } from 'firebase-admin/app';
import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Initialize Firebase using the same logic as db.ts
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
  throw new Error('Could not find Firebase credentials (file or env)');
}

initializeApp({
  credential,
  projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core'
});

const db = getFirestore();

function normalize(phone: string, region: CountryCode = 'NG'): string | null {
  try {
    const phoneNumber = parsePhoneNumber(phone, region);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.number as string;
    }
  } catch (e) {}
  return null;
}

async function migrateSubcollection(oldRef: any, newRef: any, subName: string) {
  const snapshot = await oldRef.collection(subName).get();
  for (const doc of snapshot.docs) {
    await newRef.collection(subName).doc(doc.id).set(doc.data());
    await doc.ref.delete();
  }
}

async function run() {
  console.log('🚀 Starting Phone Normalization Migration...');

  // 1. Migrate Organizations Config
  const orgs = await db.collection('organizations').get();
  for (const orgDoc of orgs.docs) {
    const data = orgDoc.data();
    const updates: any = {};
    const region = (data.region || 'NG') as CountryCode;

    if (data.config?.adminPhone) {
      const norm = normalize(data.config.adminPhone, region);
      if (norm && norm !== data.config.adminPhone) {
        updates['config.adminPhone'] = norm;
        console.log(`Org ${orgDoc.id}: Normalizing Admin Phone ${data.config.adminPhone} -> ${norm}`);
      }
    }

    if (data.config?.botPhone) {
      const norm = normalize(data.config.botPhone, region);
      if (norm && norm !== data.config.botPhone) {
        updates['config.botPhone'] = norm;
        console.log(`Org ${orgDoc.id}: Normalizing Bot Phone ${data.config.botPhone} -> ${norm}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await orgDoc.ref.update(updates);
    }

    // 2. Migrate Staff
    const staff = await orgDoc.ref.collection('staff').get();
    for (const sDoc of staff.docs) {
      const sData = sDoc.data();
      const norm = normalize(sData.phone, region);
      if (norm && norm !== sDoc.id) {
        console.log(`Org ${orgDoc.id} Staff: Migrating ${sDoc.id} -> ${norm}`);
        await orgDoc.ref.collection('staff').doc(norm).set({
          ...sData,
          phone: norm,
          updatedAt: new Date()
        });
        await sDoc.ref.delete();
      }
    }
  }

  // 3. Migrate Chats
  const chats = await db.collection('chats').get();
  for (const chatDoc of chats.docs) {
    const cData = chatDoc.data();
    const orgId = cData.organizationId;
    const oldPhone = cData.whatsappUserId;
    
    // We need to know the org's region to normalize correctly
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    const region = (orgDoc.data()?.region || 'NG') as CountryCode;

    const norm = normalize(oldPhone, region);
    if (norm && norm !== oldPhone) {
      const newChatId = `${orgId}_${norm}`;
      console.log(`Chat: Migrating ${chatDoc.id} -> ${newChatId}`);

      const newChatRef = db.collection('chats').doc(newChatId);
      
      // Copy main doc
      await newChatRef.set({
        ...cData,
        whatsappUserId: norm,
        updatedAt: new Date()
      });

      // Copy subcollections (messages, cart)
      await migrateSubcollection(chatDoc.ref, newChatRef, 'messages');
      await migrateSubcollection(chatDoc.ref, newChatRef, 'cart');

      // Delete old doc
      await chatDoc.ref.delete();
    }
  }

  console.log('✅ Migration Complete!');
}

run().catch(console.error);
