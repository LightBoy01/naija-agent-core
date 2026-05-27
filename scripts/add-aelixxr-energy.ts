import 'dotenv/config';
import { getDb } from '../packages/firebase/dist/index.js';

const MASTER_PHONE = SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;
const AMOUNT_TO_ADD = 1000;

async function addEnergy() {
  console.log(`\n🔋 Adding ${AMOUNT_TO_ADD} Energy Units to: ${MASTER_PHONE}`);
  const db = getDb();
  const docRef = db.collection('user_profiles').doc(MASTER_PHONE);

  try {
    await db.runTransaction(async (t: any) => {
      const doc = await t.get(docRef);
      let currentBalance = 0;
      
      if (doc.exists) {
        currentBalance = doc.data().energyCredits || 0;
      }

      const newBalance = currentBalance + AMOUNT_TO_ADD;
      t.set(docRef, { 
        energyCredits: newBalance, 
        lastInteraction: new Date() 
      }, { merge: true });
      
      console.log(`✅ Transaction successful. New Balance: ${newBalance} Units`);
    });
  } catch (e: any) {
    console.error('❌ Failed to add energy:', e.message);
  }
}

addEnergy();
