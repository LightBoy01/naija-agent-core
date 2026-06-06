const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const bcrypt = require('bcrypt');

const serviceAccountData = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!serviceAccountData) {
    console.error("Missing FIREBASE_SERVICE_ACCOUNT_BASE64");
    process.exit(1);
}

const serviceAccountBuffer = Buffer.from(serviceAccountData, 'base64');
const serviceAccount = JSON.parse(serviceAccountBuffer.toString('utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
    const hashed1234 = await bcrypt.hash('1234', 10);
    
    const lidRef = db.collection('user_profiles').doc('28364215738456@lid');
    await lidRef.set({ vaultPinNaira: hashed1234 }, { merge: true });
    
    const phoneRef = db.collection('user_profiles').doc('2347042310893');
    await phoneRef.set({ vaultPinNaira: hashed1234 }, { merge: true });
    
    const zynuxRef = db.collection('organizations').doc('zynux');
    await zynuxRef.set({ config: { adminPin: hashed1234 } }, { merge: true });

    const aelixxrRef = db.collection('organizations').doc('aelixxr');
    await aelixxrRef.set({ config: { adminPin: hashed1234 } }, { merge: true });
    
    console.log("Successfully set real bcrypt PIN to 1234 for user and orgs");
}

run().catch(console.error);
