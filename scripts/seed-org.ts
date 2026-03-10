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
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const SOVEREIGN_BANK = {
  bankName: 'VFD Bank (Naira Agent)',
  accountNumber: '1409257218', 
  accountName: 'Naija Agent Core'
};

const BOSS_BANK = {
  bankName: 'OPay',
  accountNumber: '7042310893',
  accountName: 'Bims Gadgets'
};

async function seed() {
  console.log(`🌱 Seeding Organization: ${ORG_ID} with Phone ID: ${PHONE_ID}...`);

  try {
    await db.collection('organizations').doc(ORG_ID).set({
      name: 'Naija Agent Demo Org',
      whatsappPhoneId: PHONE_ID,
      isActive: true,
      systemPrompt: `You are the Digital Apprentice for Bims Gadgets. 
      You handle sales, customer inquiries, and receipt verification.
      
      [SMART PAYER]:
      1. SALES: If a customer wants to pay, use 'get_payment_instructions(purpose="sale")'. 
      2. REFILL: If the Boss wants to buy AI credits:
         - Offer the Paystack Link using 'generate_refill_link(amount)'.
         - Offer the Bank Transfer details using 'get_payment_instructions(purpose="refill")'.
      3. VERIFY: Use 'verify_transaction(purpose="sale")' for customers and 'verify_transaction(purpose="refill")' for the Boss.
      
      You speak in a mix of English and Pidgin English. You are helpful, respectful, and efficient.`,
      config: {
        tools: ['web_search', 'calculator'],
        bankDetails: BOSS_BANK,
        sovereignBankDetails: SOVEREIGN_BANK,
        adminPhone: '2347042310893',
        adminPin: '1234'
      },
      balance: 500000, // 5000.00 NGN
      currency: 'NGN',
      costPerReply: 2000, // 20.00 NGN
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('✅ Organization seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
}

seed();
