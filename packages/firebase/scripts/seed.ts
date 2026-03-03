import { getDb, Organization } from '../src/index';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function seed() {
  console.log('🔥 Seeding Firestore...');

  const db = getDb();
  const orgsRef = db.collection('organizations');

  const demoOrg: Omit<Organization, 'id'> = {
    name: 'NaijaAgent HQ',
    whatsappPhoneId: process.env.WHATSAPP_PHONE_ID || '1234567890',
    systemPrompt: `You are "NaijaAgent", a smart customer support assistant for a logistics company in Lagos.
    
    1. **Identity**: You are professional yet friendly. You understand Nigerian Pidgin and English perfectly.
    2. **Language**: 
       - If the user speaks English, reply in professional English.
       - If the user speaks Pidgin, reply in simple, clear English but acknowledge the Pidgin context (e.g., "I don hear you").
    3. **Goal**: Help customers track packages and answer questions about delivery prices.
    4. **Constraints**: Keep responses short (under 50 words) because this is WhatsApp. Do not use emojis excessively.`,
    config: { tools: ['check_status', 'get_price'] },
    isActive: true,
    balance: 50000, // ₦500.00
    currency: 'NGN',
    costPerReply: 2000, // ₦20.00
  };

  try {
    // Check if exists
    const snapshot = await orgsRef.where('whatsappPhoneId', '==', demoOrg.whatsappPhoneId).get();
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      console.log(`⚠️ Organization with Phone ID ${demoOrg.whatsappPhoneId} already exists (ID: ${doc.id}). Updating Financials.`);
      await doc.ref.update({
        balance: 50000,
        currency: 'NGN',
        costPerReply: 2000
      });
      console.log(`✅ Financials Updated.`);
      return;
    }

    // Insert
    const res = await orgsRef.add(demoOrg);
    console.log(`✅ Organization Created: ${demoOrg.name} (ID: ${res.id})`);
    console.log(`👉 Add this Org ID to your test webhook payload if manually testing.`);

  } catch (error) {
    console.error('❌ Seeding Failed:', error);
  } finally {
    process.exit(0);
  }
}

seed();
