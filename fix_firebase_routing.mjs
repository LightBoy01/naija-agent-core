import { getDb as getFirestore } from './packages/firebase/dist/index.js';
import dotenv from 'dotenv';
dotenv.config();

const db = getFirestore();

async function fixFirebaseSplitBrain() {
  console.log('Fetching Firebase organizations...');
  
  // 1. Remove botPhone from ghost aelixxr
  const ghostRef = db.collection('organizations').doc('aelixxr');
  const ghostDoc = await ghostRef.get();
  if (ghostDoc.exists) {
      console.log('Ghost aelixxr found. Nullifying botPhone...');
      await ghostRef.set({ config: { botPhone: null } }, { merge: true });
  }

  // 2. Set botPhone on true aelixxr-life-companion
  const trueRef = db.collection('organizations').doc('aelixxr-life-companion');
  const trueDoc = await trueRef.get();
  if (trueDoc.exists) {
      console.log('True aelixxr-life-companion found. Setting botPhone to 2349015772541...');
      await trueRef.set({ config: { botPhone: '2349015772541' } }, { merge: true });
  }

  console.log('Firebase mapping updated successfully!');
}

fixFirebaseSplitBrain().catch(console.error);
