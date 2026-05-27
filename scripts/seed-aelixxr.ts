import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.resolve(__dirname, '../packages/firebase/serviceAccountKey.json');
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

const ORG_ID = 'aelixxr-life-companion';
const PHONE_ID = '1189172570934595'; // New LOS Phone ID
const BOSS_PHONE = process.env.MASTER_ADMIN_PHONE || SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;

async function seedAelixxr() {
  console.log(`🌿 [SEEDING AELIXXR] ID: ${ORG_ID} | Phone ID: ${PHONE_ID}...`);

  try {
    const aelixxrSoulPath = path.resolve(__dirname, '../apps/worker-life/src/prompts/Aelixxr.Soul.md');
    let systemPrompt = "You are Aelixxr, a proactive Life OS companion.";
    if (fs.existsSync(aelixxrSoulPath)) {
        systemPrompt = fs.readFileSync(aelixxrSoulPath, 'utf-8');
        console.log('🧠 Loaded Aelixxr.Soul.md into System Prompt');
    }

    await db.collection('organizations').doc(ORG_ID).set({
      name: 'Aelixxr Life Companion',
      whatsappPhoneId: PHONE_ID,
      isActive: true,
      systemPrompt: systemPrompt,
      config: {
        tools: ['web_search', 'calculator', 'generate_quiz', 'search_vault'],
        adminPhone: BOSS_PHONE,
        adminPin: '0000',
        model: 'gemini-2.5-flash',
        isMaster: false,
        isLifeCompanion: true
      },
      balance: 1000000, // 10,000.00 NGN for testing
      currency: 'NGN',
      costPerReply: 0, // Life Companion is often subsidized or has custom billing
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Aelixxr Life Companion seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    process.exit(0);
  }
}

seedAelixxr();
