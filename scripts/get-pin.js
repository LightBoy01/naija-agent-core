const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccountData = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!serviceAccountData) {
    console.error("Missing FIREBASE_SERVICE_ACCOUNT_BASE64");
    process.exit(1);
}

const serviceAccountBuffer = Buffer.from(serviceAccountData, 'base64');
const serviceAccount = JSON.parse(serviceAccountBuffer.toString('utf-8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
    const doc = await db.collection('organizations').doc('zynux').get();
    if (doc.exists) {
        console.log("Zynux Config PIN:", doc.data().config?.adminPin);
    } else {
        console.log("Zynux not found");
    }
    
    const aelixxrDoc = await db.collection('organizations').doc('aelixxr').get();
    if (aelixxrDoc.exists) {
        console.log("Aelixxr Config PIN:", aelixxrDoc.data().config?.adminPin);
    }
    
    const userDoc = await db.collection('user_profiles').doc('2347042310893').get();
    if (userDoc.exists) {
        console.log("User 2347042310893 PIN:", userDoc.data().vaultPinNaira);
    } else {
        console.log("User 2347042310893 not found in user_profiles");
    }
    
    // Also try lid
    const lidDoc = await db.collection('user_profiles').doc('28364215738456@lid').get();
    if (lidDoc.exists) {
        console.log("User 28364215738456@lid PIN:", lidDoc.data().vaultPinNaira);
    }
    
}

run().catch(console.error);
