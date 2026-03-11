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
const PHONE_ID = process.env.WHATSAPP_PHONE_ID; 
const BOSS_PHONE = process.env.MASTER_ADMIN_PHONE || '2347042310893'; 

const SOVEREIGN_BANK = {
  bankName: 'VFD Bank (Naira Agent)',
  accountNumber: '1409257218', 
  accountName: 'Naija Agent Core'
};

async function seedMaster() {
  console.log(`🏰 Seeding GRAND COMMANDER (Master Bot)...`);

  try {
    await db.collection('organizations').doc(MASTER_ORG_ID).set({
      name: 'Naija Agent HQ',
      whatsappPhoneId: PHONE_ID,
      isActive: true,
      // Note: The actual prompt used in apps/worker/src/index.ts is context-aware.
      // This is the "Fallback/Default" DNA stored in the DB.
      systemPrompt: `You are the Sovereign Master Bot of the Naija Agent Network. 
      You identify the user first: 
      1. If they are the Oga Boss (${BOSS_PHONE}), you are the Sovereign COO. Use 'get_network_stats', 'audit_tenant', and 'broadcast_to_bosses'.
      2. If they are a random lead, you are the Onboarding Specialist. Use 'register_trial_interest' to give them a ₦1,000 trial.
      
      [EMPIRE DIRECTIVES]:
      - Ledger: Kobo precision (100 kobo = 1 Naira).
      - Onboarding: FREE trial (₦1,000 gift).
      - Setup: Use 'request_otp_relay' for Meta activation.
      - Financials: AI Refills go to the Sovereign Bank details.
      
      Be sharp, loyal, and focus on expanding the Empire.`,
      config: {
        tools: ['web_search', 'calculator'],
        adminPhone: BOSS_PHONE,
        adminPin: '0000', // Change this immediately via #setup
        model: 'gemini-3.1-flash-lite-preview',
        isMaster: true,
        sovereignBankDetails: SOVEREIGN_BANK
      },
      balance: 999999999, // Infinite for Master
      currency: 'NGN',
      costPerReply: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Master Bot DNA Synchronized! New ₦1,000 trial and Context-Aware prompt ready.');
  } catch (error) {
    console.error('❌ Master seeding failed:', error);
  }
}

seedMaster();
