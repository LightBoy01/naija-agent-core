import { getDb as getFirestore } from '../packages/firebase/dist/index.js';
import { db as sql, organizations, users, transactions, memories } from '../packages/database/dist/index.js';
import dotenv from 'dotenv';
import { logger } from '../apps/worker/src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

async function migrate() {
  const firestore = getFirestore();
  const sqlDb = sql;

  if (!sqlDb) {
    console.error('❌ SQL Database not initialized. Set DATABASE_URL.');
    return;
  }

  console.log('🚀 Starting Great Migration: Firestore -> TiDB');

  // --- 1. Migrate Organizations ---
  console.log('🏢 Migrating Organizations...');
  const orgsSnapshot = await firestore.collection('organizations').get();
  for (const doc of orgsSnapshot.docs) {
    const data = doc.data();
    try {
      await sqlDb.insert(organizations).values({
        id: doc.id,
        name: data.name || 'Unknown Org',
        balanceKobo: data.balance || 0,
        isActive: data.isActive !== false,
        region: data.region || 'NG',
        sector: data.sector || 'commerce',
        whatsappPhoneId: data.whatsappPhoneId || null,
        timezone: data.timezone || 'Africa/Lagos',
        config: data.config || {},
        systemPrompt: data.systemPrompt || null,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onDuplicateKeyUpdate({
        set: { name: data.name }
      });
      console.log(`✅ Org: ${data.name}`);
    } catch (err: any) {
      console.error(`❌ Failed Org ${doc.id}: ${err.message}`);
    }
  }

  // --- 2. Migrate Users (Life OS) ---
  console.log('\n👤 Migrating Users...');
  const usersSnapshot = await firestore.collection('user_profiles').get();
  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    try {
      // Map Firestore fields to SQL
      await sqlDb.insert(users).values({
        phone: doc.id,
        name: data.name || null,
        energyCredits: data.energyCredits || 0,
        vaultBalanceNaira: (data.vaultBalanceNaira || 0).toString(),
        pinHash: data.pin || null, // Note: We should ideally rename this to pin_hash in DB later
        pinAttempts: data.pinAttempts || 0,
        pinLockUntil: data.pinLockUntil?.toDate() || null,
        context: data, // Save full context as JSON for safety
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onDuplicateKeyUpdate({
        set: { energyCredits: data.energyCredits }
      });
      
      // Migrate Episodic Events as Memories
      const eventsSnapshot = await firestore.collection('user_profiles').doc(doc.id).collection('episodic_events').get();
      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        await sqlDb.insert(memories).values({
          id: uuidv4(),
          userId: doc.id,
          category: 'episodic',
          content: `${eventData.title}: ${eventData.details}`,
          importance: 1,
          createdAt: eventData.timestamp?.toDate() || new Date(),
        });
      }
      
      console.log(`✅ User: ${doc.id} (+${eventsSnapshot.size} events)`);
    } catch (err: any) {
      console.error(`❌ Failed User ${doc.id}: ${err.message}`);
    }
  }

  console.log('\n🏁 Migration Finished!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('💥 Migration Crashed:', err);
  process.exit(1);
});
