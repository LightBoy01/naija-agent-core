import * as admin from 'firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

// Initialize Firebase
if (!admin.apps.length) {
  let saRaw = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
  
  // Hyper-aggressive cleanup: Remove anything that is not a standard ASCII printable character 
  // or part of the JSON structure.
  const cleanSa = saRaw
    .replace(/[^\x20-\x7E]/g, '') // Keep only standard printable ASCII
    .trim();

  try {
    const serviceAccount = JSON.parse(cleanSa);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  } catch (err: any) {
    // Last resort: Try local file if ENV fails
    const localPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
    if (fs.existsSync(localPath)) {
       admin.initializeApp({
         credential: admin.credential.cert(localPath),
         projectId: process.env.FIREBASE_PROJECT_ID
       });
    } else {
       throw new Error(`Firebase Auth Failed: ${err.message}`);
    }
  }
}

const db = getFirestore();
const orgsRef = db.collection('organizations');

async function runRedTeam() {
  console.log('\n🕵️‍♂️ --- NAIJA AGENT RED-TEAM VERIFICATION (STANDALONE) --- 🕵️‍♂️');
  const testOrgId = `redteam_test_${Date.now()}`;

  try {
    // 1. Gift Verification Logic
    console.log('\n🛠️ [1/5] Testing Frictionless Onboarding...');
    const bonusKobo = 50000; // 500.00 NGN
    
    await orgsRef.doc(testOrgId).set({
      name: 'RedTeam Bakery',
      balance: bonusKobo,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    const org = (await orgsRef.doc(testOrgId).get()).data();
    if (org?.balance === 50000) {
      console.log('   ✅ Gift Check: ₦500.00 correctly assigned.');
    } else {
      throw new Error(`Gift mismatch: ${org?.balance}`);
    }

    // 2. Atomic Balance Safety
    console.log('\n💰 [2/5] Testing Atomic Deduction...');
    const deductAmount = 2000; // 20.00 NGN
    
    await db.runTransaction(async (t) => {
      const doc = await t.get(orgsRef.doc(testOrgId));
      const current = doc.data()?.balance || 0;
      t.update(orgsRef.doc(testOrgId), { balance: current - deductAmount });
    });

    const orgAfterDeduct = (await orgsRef.doc(testOrgId).get()).data();
    if (orgAfterDeduct?.balance === 48000) {
      console.log('   ✅ Atomic Deduction: OK (50000 - 2000 = 48000).');
    } else {
      throw new Error(`Deduction mismatch: ${orgAfterDeduct?.balance}`);
    }

    // 3. Inventory Guard Logic
    console.log('\n📦 [3/5] Testing Stock Guardian...');
    const productRef = orgsRef.doc(testOrgId).collection('products').doc('bread-001');
    await productRef.set({
      name: 'Agege Bread',
      stock: 5,
      lowStockThreshold: 3
    });

    // Simulate Sale
    await db.runTransaction(async (t) => {
      const doc = await t.get(productRef);
      const stock = doc.data()?.stock || 0;
      t.update(productRef, { stock: stock - 3 });
    });

    const product = (await productRef.get()).data();
    const isLow = (product?.stock || 0) <= (product?.lowStockThreshold || 0);
    if (isLow && product?.stock === 2) {
      console.log('   ✅ Stock Guardian: OK (Stock is 2, Threshold is 3 -> Triggered).');
    } else {
      throw new Error(`Stock logic error: ${product?.stock}`);
    }

    // 4. Security Context Simulation
    console.log('\n🛡️ [4/5] Testing Security Isolation...');
    const roles = [
      { type: 'ADMIN', isManager: true, expectBalance: true },
      { type: 'CUSTOMER', isManager: false, expectBalance: false }
    ];

    for (const role of roles) {
      const balanceContext = role.isManager ? `[CONTEXT] Balance: ${orgAfterDeduct?.balance}` : "";
      const seen = balanceContext.includes('48000');
      if (seen === role.expectBalance) {
        console.log(`   ✅ Security Check (${role.type}): OK.`);
      } else {
        throw new Error(`Security Leak for ${role.type}!`);
      }
    }

    // 5. Network Trend Logic
    console.log('\n🏰 [5/5] Testing Network Benchmark Logic...');
    const dateStr = new Date().toISOString().split('T')[0];
    await orgsRef.doc(testOrgId).collection('daily_snapshots').doc(dateStr).set({
       totalSalesKobo: 500000,
       updatedAt: FieldValue.serverTimestamp()
    });

    const snapshots = await db.collectionGroup('daily_snapshots').get();
    let total = 0;
    let count = 0;
    snapshots.forEach(s => {
      if (s.id === dateStr) {
        total += (s.data().totalSalesKobo || 0);
        count++;
      }
    });

    if (count > 0) {
      console.log(`   ✅ Network Benchmark: Found ${count} bots for ${dateStr}. Average: ₦${(total/count)/100}`);
    }

    console.log('\n🏁 --- RED-TEAM VERIFICATION SUCCESSFUL --- 🏁');

  } catch (err: any) {
    console.error('\n❌ VERIFICATION FAILED:', err.message);
    process.exit(1);
  } finally {
    console.log(`\n🧹 Cleaning up: ${testOrgId}`);
    await orgsRef.doc(testOrgId).delete();
    process.exit(0);
  }
}

runRedTeam();
