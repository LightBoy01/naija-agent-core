import { getDb } from './packages/firebase/dist/index.js';

async function check() {
  const db = getDb();
  const snap = await db.collection('user_profiles').get();
  console.log('Firebase user_profiles:');
  snap.forEach(doc => {
    const data = doc.data();
    if (data.energyCredits > 500) {
      console.log(doc.id, '->', data.energyCredits, data.name);
    }
  });
  process.exit(0);
}
check().catch(console.error);
