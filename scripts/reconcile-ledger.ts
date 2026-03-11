import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load Environment
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

const db = getFirestore();

async function reconcileLedger() {
  console.log('\n⚖️  --- NAIJA AGENT LEDGER RECONCILIATION --- ⚖️');
  console.log(`Time: ${new Date().toISOString()}\n`);

  // 1. Fetch Current Vault Total (The "Believed" Value)
  const metaDoc = await db.collection('network_metadata').doc('global').get();
  const currentVaultTotal = metaDoc.data()?.totalVaultKobo || 0;
  console.log(`🏦 Current Vault Total: ₦${(currentVaultTotal / 100).toLocaleString()}`);

  // 2. Calculate True Total (The "Actual" Value)
  console.log('🔍 Auditing Tenant Balances...');
  let trueTotalKobo = 0;
  let tenantCount = 0;
  let discrepancies = 0;

  const orgsSnapshot = await db.collection('organizations').get();
  
  for (const doc of orgsSnapshot.docs) {
    if (doc.id === 'naija-agent-master') continue; // Exclude Sovereign from total liability

    const data = doc.data();
    const balance = data.balance || 0;
    
    trueTotalKobo += balance;
    tenantCount++;

    // Optional: Log negative balances (Financial Risk)
    if (balance < 0) {
      console.warn(`⚠️  NEGATIVE BALANCE: ${data.name} (${doc.id}) -> ₦${(balance/100).toLocaleString()}`);
      discrepancies++;
    }
  }

  console.log(`✅ Audited ${tenantCount} active tenants.`);
  console.log(`💰 True Total Liability: ₦${(trueTotalKobo / 100).toLocaleString()}`);

  // 3. Compare and Fix
  const diff = trueTotalKobo - currentVaultTotal;

  if (diff !== 0) {
    console.error(`❌ LEDGER DRIFT DETECTED: ₦${(diff / 100).toLocaleString()}`);
    console.log('🛠️  Correcting Vault Total...');
    
    await db.collection('network_metadata').doc('global').update({
      totalVaultKobo: trueTotalKobo,
      lastReconciledAt: FieldValue.serverTimestamp(),
      driftDetected: diff
    });
    
    console.log('✅ Vault Total Updated. Ledger is now BALANCED.');
  } else {
    console.log('✅ Ledger is PERFECTLY BALANCED. No action needed.');
    // Just update the timestamp
    await db.collection('network_metadata').doc('global').update({
      lastReconciledAt: FieldValue.serverTimestamp()
    });
  }

  console.log('\n🏁 Reconciliation Complete.');
  process.exit(0);
}

reconcileLedger().catch(err => {
  console.error('❌ Fatal Error:', err);
  process.exit(1);
});
