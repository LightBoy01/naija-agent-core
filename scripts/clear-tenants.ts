import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function clearTenants() {
  console.log('🧹 --- CLEARING ALL TENANTS (EXCEPT MASTER) --- 🧹\n');

  try {
    const orgsSnapshot = await db.collection('organizations').get();
    let deletedCount = 0;

    for (const orgDoc of orgsSnapshot.docs) {
      if (orgDoc.id === 'naija-agent-master') {
        console.log(`👑 Skipping Master Bot: [${orgDoc.id}]`);
        continue;
      }

      console.log(`🗑️ Deleting Org: ${orgDoc.data().name || orgDoc.id} [${orgDoc.id}]...`);
      
      // Note: In a production environment, we'd recursively delete sub-collections.
      // For now, we'll just delete the org document.
      await orgDoc.ref.delete();
      deletedCount++;
    }

    console.log(`\n✅ Cleanup Complete. Deleted ${deletedCount} organizations.`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

clearTenants();
