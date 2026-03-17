import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert } from 'firebase-admin/app';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Initialize Firebase
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './packages/firebase/serviceAccountKey.json';

let serviceAccount;
if (fs.existsSync(serviceAccountPath)) {
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  throw new Error('Service Account not found');
}

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // If we are using the env var, we need to fix the private key
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

try {
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch (e) {
  // Ignore if already initialized
}

const db = getFirestore();

async function fixRouting() {
  console.log('🔧 Fixing Master Bot Routing Conflicts...');
  
  const conflictingOrgs = [
    'naija-agent-org-001',
    'test-onboarding-org', 
    'test_empire_084' // CivicStack (Might want to keep this one active? No, it conflicts on the test number)
  ];

  for (const orgId of conflictingOrgs) {
    const orgRef = db.collection('organizations').doc(orgId);
    const doc = await orgRef.get();
    
    if (!doc.exists) {
      console.log(`⚠️ Org ${orgId} not found, skipping.`);
      continue;
    }

    const data = doc.data();
    const currentPhoneId = data?.whatsappPhoneId;
    const currentAdmin = data?.config?.adminPhone;

    console.log(`Checking ${orgId}... PhoneID: ${currentPhoneId}, Admin: ${currentAdmin}`);

    // Update to dummy values to prevent routing collisions
    await orgRef.update({
      whatsappPhoneId: `DUMMY_ID_${orgId}`,
      'config.adminPhone': `${currentAdmin}_DISABLED`,
      isActive: false // Disable them to be safe
    });

    console.log(`✅ Disabled ${orgId} and moved to DUMMY_ID.`);
  }

  // Verify Master Bot
  const masterRef = db.collection('organizations').doc('naija-agent-master');
  const masterDoc = await masterRef.get();
  if (masterDoc.exists) {
     const data = masterDoc.data();
     console.log(`\n👑 Master Bot Status:`);
     console.log(`   ID: ${masterDoc.id}`);
     console.log(`   PhoneID: ${data?.whatsappPhoneId}`);
     console.log(`   Admin: ${data?.config?.adminPhone}`);
     console.log(`   Active: ${data?.isActive}`);
     
     if (!data?.isActive) {
        console.log('⚠️ Master Bot is INACTIVE! Activating...');
        await masterRef.update({ isActive: true });
        console.log('✅ Master Bot Activated.');
     }
  } else {
     console.error('❌ Master Bot NOT FOUND!');
  }
}

fixRouting();
