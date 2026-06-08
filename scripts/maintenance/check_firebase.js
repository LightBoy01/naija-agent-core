import { db as firebaseDb } from '../../packages/firebase/src/db.js';

async function check() {
  console.log('Querying Firebase...');
  const orgs = await firebaseDb.collection('organizations').get();
  console.log(`Found ${orgs.size} organizations.`);
  
  for (const doc of orgs.docs) {
    const prod = await doc.ref.collection('products').get();
    const act = await doc.ref.collection('activities').get();
    console.log(`Org: ${doc.id} - Products: ${prod.size}, Activities: ${act.size}`);
  }
}

check().catch(console.error);
