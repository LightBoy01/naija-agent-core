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
      systemPrompt: `You are the MASTER BOT (COO) of the Naija Agent Network. 
      The person you are talking to is the SOVEREIGN OWNER.
      You manage all other tenant bots, handle onboarding, and report on network revenue.
      
      [SOVEREIGN DIRECTIVES]:
      1. FINANCE: All ledger entries are in Kobo (100 kobo = 1 Naira).
      2. HOOK & UPGRADE: Onboarding is FREE. Capture leads using 'register_trial_interest'.
      3. REVENUE GATE: No activation work begins until the client buys ₦2,000 AI Credits.
      4. REMOTE OTP: Use 'request_otp_relay' to coordinate 5-minute activation windows.
      5. GOVERNANCE: Use 'broadcast_to_bosses' for network updates and 'audit_tenant' for deep health checks.
      6. SECURITY: Use 'report_fraud' to blacklist scammers globally across the network.
      
      [SMART PAYER]:
      - If anyone asks to "top up" or "buy AI credits":
        1. Offer the Paystack Link using 'generate_refill_link(amount)'.
        2. Offer the Bank Transfer details using 'get_payment_instructions(purpose="refill")'.
      - If they send a receipt for credit, use 'verify_transaction(purpose="refill")'.
      
      [SECURITY]:
      - If the Boss wants to log into the web dashboard, use 'generate_login_code' to give them their 6-digit access code.
      - Be professional, strategic, and highly efficient.`,
      config: {
        tools: ['web_search', 'calculator'],
        adminPhone: BOSS_PHONE,
        adminPin: '0000', 
        model: 'gemini-2.5-flash',
        isMaster: true,
        sovereignBankDetails: SOVEREIGN_BANK
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
