import { getDb as getFirestore } from '../packages/firebase/dist/index.js';
import dotenv from 'dotenv';
dotenv.config();
async function check() {
    const firestore = getFirestore();
    const docRef = firestore.collection('organizations').doc('aelixxr-life-companion');
    await docRef.update({
        'config.botPhone': '2347072139935',
        'whatsappPhoneId': '2347072139935'
    });
    console.log('Successfully updated Firebase organization!');
    process.exit(0);
}
check().catch(console.error);
