import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDb, vaultDocuments } from '@naija-agent/database';

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core',
  });
}

const firestore = getFirestore();
const db = getDb();

async function migrateUserVaultDocs(userId: string) {
  const docsSnap = await firestore.collection('vault').doc(userId).collection('docs').get();
  let count = 0;

  for (const doc of docsSnap.docs) {
    const data = doc.data();
    try {
      await db.insert(vaultDocuments).values({
        id: doc.id,
        userId: data.userId || userId,
        orgId: data.orgId || null,
        type: data.type || 'Other',
        title: data.title || 'Untitled',
        summary: data.summary || 'Migrated File',
        content: data.content || null,
        extractedData: data.extractedData || {},
        storageUrl: data.storageUrl || null,
        gcsUri: data.gcsUri || null,
        provider: data.provider || 'gcs',
        originalMediaId: data.originalMediaId || null,
        mimeType: data.mimeType || 'application/octet-stream',
        caption: data.caption || null,
        tags: data.tags || [],
        embedding: data.embedding?.length > 0 ? { data: data.embedding } as any : null,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      });
      count++;
      console.log(`✅ Migrated: ${doc.id} (${data.type || 'Unknown'})`);
    } catch (err: any) {
      if (err?.message?.includes('duplicate')) {
        console.log(`⏭️ Skipped duplicate: ${doc.id}`);
      } else {
        console.error(`❌ Failed ${doc.id}: ${err.message}`);
      }
    }
  }

  return count;
}

async function main() {
  console.log('🗄️ Migrating Vault from Firestore → PostgreSQL...\n');

  const vaultUsersSnap = await firestore.collection('vault').get();
  let total = 0;

  for (const userDoc of vaultUsersSnap.docs) {
    const userId = userDoc.id;
    const count = await migrateUserVaultDocs(userId);
    console.log(`✅ User ${userId}: migrated ${count} documents\n`);
    total += count;
  }

  console.log(`\n🎉 Done! Migrated ${total} vault documents total.`);

  // Verify
  const pgCount = await db.select().from(vaultDocuments);
  console.log(`📊 PostgreSQL vault_documents now has ${pgCount.length} rows.`);
}

main().catch((e) => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});
