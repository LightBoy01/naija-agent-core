import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { readFileSync } from 'fs';
import path from 'path';

// Setup Admin SDK with robust logic from packages/firebase/src/db.ts
let serviceAccount: any;

if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
  serviceAccount = JSON.parse(decoded);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.trim());
} else {
  try {
    serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
  } catch (e) {
    console.error('❌ Failed to find Firebase credentials (env or file)');
    process.exit(1);
  }
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function auditOnboarding() {
  console.log('🕵️ [RED TEAM] Starting Onboarding Forensic Audit...');
  
  const orgs = await db.collection('organizations').get();
  let totalPINsFound = 0;
  let totalPendingFound = 0;

  orgs.forEach(doc => {
    const data = doc.data();
    
    // 1. Audit: Plain-text PINs in onboardingData
    if (data.onboardingData?.adminPin) {
      const pin = data.onboardingData.adminPin;
      // If it's 4 digits and numeric, it's definitely plain text
      if (/^\d{4}$/.test(pin)) {
        console.warn(`🚨 [VULNERABILITY] Plain-text PIN found in 'onboardingData' for: ${doc.id} (${data.name || 'Unknown'})`);
        totalPINsFound++;
      }
    }

    // 2. Audit: Orphaned Pending Setups
    if (data.pendingSetup) {
      const age = (Date.now() - new Date(data.pendingSetup.initiatedAt).getTime()) / (1000 * 60 * 60);
      if (age > 24) {
        console.warn(`⚠️ [DATA HYGIENE] Orphaned 'pendingSetup' found for: ${doc.id} (Age: ${Math.floor(age)}h)`);
        totalPendingFound++;
      }
    }
  });

  console.log(`\n📊 [AUDIT SUMMARY]`);
  console.log(`- Plain-text PINs: ${totalPINsFound}`);
  console.log(`- Orphaned Setups: ${totalPendingFound}`);
  
  if (totalPINsFound > 0) {
    console.error('\n❌ CRITICAL: PII Leakage detected in Firestore. Cleanup required.');
  } else {
    console.log('\n✅ Privacy Audit Passed (No plain-text PINs found).');
  }
}

auditOnboarding().catch(console.error);
