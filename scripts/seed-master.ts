import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

// --- Master Config ---
const MASTER_ORG_ID = 'naija-agent-master';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID; // Your Test Number
const BOSS_PHONE = '2347042310893'; // The Oga of Ogas

async function seedMaster() {
  console.log(`🏰 Seeding GRAND COMMANDER (Master Bot)...`);

  try {
    await db.collection('organizations').doc(MASTER_ORG_ID).set({
      name: 'Naija Agent HQ',
      whatsappPhoneId: PHONE_ID,
      isActive: true,
      systemPrompt: `You are the MASTER BOT (COO) of the Naija Agent Network. 
      The person you are talking to is the SOVEREIGN OWNER.
      You manage all other tenant bots, handle onboarding, and report on network revenue.
      Be professional, strategic, and highly efficient.`,
      config: {
        tools: ['web_search', 'calculator'],
        adminPhone: BOSS_PHONE,
        adminPin: '0000', 
        model: 'gemini-2.5-flash',
        isMaster: true 
      },
      balance: 999999999, // Infinite for Master
      currency: 'NGN',
      costPerReply: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Master Bot seeded successfully! Your number is now registered as the Sovereign.');
  } catch (error) {
    console.error('❌ Master seeding failed:', error);
  }
}

seedMaster();
