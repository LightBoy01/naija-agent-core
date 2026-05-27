import 'dotenv/config';
import { getDb } from '../packages/firebase/dist/index.js';

const MASTER_PHONE = SystemConfig.CONTACTS.MASTER_ADMIN_PHONE;

async function checkBalance() {
  console.log(`\n🔍 Checking Aelixxr (Life OS) Profile for: ${MASTER_PHONE}`);
  const db = getDb();
  
  try {
    const profileDoc = await db.collection('user_profiles').doc(MASTER_PHONE).get();
    
    if (!profileDoc.exists) {
      console.log('❌ No profile found for this number.');
      return;
    }

    const data = profileDoc.data();
    console.log('\n=========================================');
    console.log('       AELIXXR USER PROFILE REPORT       ');
    console.log('=========================================');
    console.log(`📱 Phone:       ${MASTER_PHONE}`);
    console.log(`🔋 Energy:      ${data.energyCredits} Units`);
    console.log(`🕒 Last Active: ${data.lastInteraction?.toDate ? data.lastInteraction.toDate().toLocaleString() : data.lastInteraction}`);
    console.log(`🎯 Goals:       ${data.goals?.length || 0} active`);
    console.log(`👨‍👩‍👧‍👦 Family:      ${data.family ? 'Configured' : 'Empty'}`);
    console.log('=========================================\n');

    // Also check vault stats
    const vaultSnapshot = await db.collection('vault').doc(MASTER_PHONE).collection('docs').get();
    console.log(`📁 Vault Items: ${vaultSnapshot.size} documents/notes`);
    
  } catch (e: any) {
    console.error('❌ Error reading database:', e.message);
  }
}

checkBalance();
