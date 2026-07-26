import { getDb } from './packages/firebase/src/index.js';
async function run() {
  const db = getDb();
  const doc1 = await db.collection('organizations').doc('aelixxr').get();
  console.log('aelixxr exists:', doc1.exists);
  const doc2 = await db.collection('organizations').doc('aelixxr-life-companion').get();
  console.log('aelixxr-life-companion exists:', doc2.exists);
  if (doc1.exists) console.log(doc1.data());
  if (doc2.exists) console.log(doc2.data());
}
run().catch(console.error);
