import { getDb as getFirestore } from './packages/firebase/dist/index.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const firestore = getFirestore();
  const orgs = await firestore.collection('organizations').get();
  console.log('Firebase Orgs:');
  orgs.forEach(doc => console.log(doc.id, doc.data().name));
  process.exit(0);
}
check().catch(console.error);
