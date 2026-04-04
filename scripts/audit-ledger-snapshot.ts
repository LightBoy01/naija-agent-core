import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

if (!serviceAccount) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY");
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function auditLedger() {
  console.log("Starting Snapshot-based Ledger Audit...");
  const orgsRef = db.collection('organizations');
  const orgs = await orgsRef.get();

  for (const orgDoc of orgs.docs) {
    const orgId = orgDoc.id;
    const orgData = orgDoc.data();
    
    // Get latest snapshot
    const snapshotRef = orgDoc.ref.collection('audit_snapshots').doc('latest');
    const snapshotDoc = await snapshotRef.get();
    
    let lastAuditTime = new Date(0); // Epoch
    let lastBalance = 0;

    if (snapshotDoc.exists) {
        const snapData = snapshotDoc.data();
        lastAuditTime = snapData?.timestamp?.toDate() || new Date(0);
        lastBalance = snapData?.balance || 0;
    }

    console.log(`Auditing Org: ${orgId}, Last Audit: ${lastAuditTime.toISOString()}, Last Balance: ${lastBalance}`);

    // Fetch transactions since last audit
    const txRef = orgDoc.ref.collection('transactions')
      .where('status', '==', 'success')
      .where('verifiedAt', '>', lastAuditTime);
    
    const txs = await txRef.get();
    
    let delta = 0;
    for (const tx of txs.docs) {
      const amount = tx.data().amount || 0;
      delta += amount;
    }

    const expectedBalance = lastBalance + delta;
    const currentBalance = orgData.balance || 0;

    if (expectedBalance !== currentBalance) {
      console.error(`🚨 DISCREPANCY DETECTED for ${orgId}! Expected: ${expectedBalance}, Actual: ${currentBalance}`);
      // Here, integrate with Sovereign Snitch to send alert
      // alertSovereignSnitch(`🚨 Ledger Integrity Failure: Org ${orgId}. Expected ${expectedBalance}, found ${currentBalance}.`);
    } else {
      console.log(`✅ Org ${orgId} Ledger is clean. Balance: ${currentBalance}`);
      
      // Save new snapshot
      await snapshotRef.set({
          balance: currentBalance,
          timestamp: new Date()
      });
    }
  }
}

auditLedger().catch(console.error);