import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccountPath = path.resolve(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function seedPlayground() {
  console.log(`🎮 Seeding PLAYGROUND BOT (Old Number)...`);

  const OLD_PHONE_ID = '1189172570934595';
  const PLAYGROUND_ID = 'naija-agent-playground';

  try {
    await db.collection('organizations').doc(PLAYGROUND_ID).set({
      name: 'Naija Agent Playground',
      whatsappPhoneId: OLD_PHONE_ID,
      isActive: true,
      systemPrompt: `You are the Playground Bot for the Naija Agent Empire. 
      You are here for testing and fun. You are allowed to be more casual.
      Explain that this is the "Old Test Number" and the real Master has moved to +234 912 158 0452.`,
      config: {
        tools: ['web_search', 'calculator'],
        adminPhone: process.env.MASTER_ADMIN_PHONE,
        model: 'gemma-4-26b-a4b-it',
        isMaster: false
      },
      balance: 1000000, // 10,000 NGN for testing
      currency: 'NGN',
      costPerReply: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Playground Bot Ready!');
  } catch (error) {
    console.error('❌ Failed:', error);
  }
}

seedPlayground();
