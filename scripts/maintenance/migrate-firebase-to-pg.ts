import { db as firebaseDb } from '../../packages/firebase/src/db.js';
import { db as pgDb } from '../../packages/database/src/db.js';
import { products, activities } from '../../packages/database/src/schema.js';

async function migrate() {
  console.log('🚀 Starting The Great Firebase Purge (Migration)');
  
  if (!pgDb) {
    throw new Error('❌ PostgreSQL Database not initialized. Ensure DATABASE_URL is set in .env');
  }

  // 1. Migrate Products
  console.log('📦 Migrating Products...');
  const orgsSnapshot = await firebaseDb.collection('organizations').get();
  let totalProducts = 0;
  
  for (const orgDoc of orgsSnapshot.docs) {
    const orgId = orgDoc.id;
    const productsSnapshot = await orgDoc.ref.collection('products').get();
    
    if (!productsSnapshot.empty) {
      const productsData = productsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orgId: orgId,
          name: data.name || data.title || 'Unnamed Product',
          nameLowercase: data.nameLowercase || (data.name || '').toLowerCase(),
          description: data.description || null,
          price: data.price ? String(data.price) : null,
          stock: data.stock || 0,
          reserved: data.reserved || 0,
          lowStockThreshold: data.lowStockThreshold || 3,
          isLowStock: data.isLowStock || false,
          metadata: data, // Preserve everything else in JSONB
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };
      });
      
      // Batch insert with conflict resolution (idempotency)
      await pgDb.insert(products).values(productsData).onConflictDoNothing();
      totalProducts += productsData.length;
      console.log(`  -> Migrated ${productsData.length} products for org: ${orgId}`);
    }
  }

  // 2. Migrate Activities
  console.log('📝 Migrating Activities...');
  let totalActivities = 0;
  for (const orgDoc of orgsSnapshot.docs) {
    const orgId = orgDoc.id;
    const activitiesSnapshot = await orgDoc.ref.collection('activities').get();
    
    if (!activitiesSnapshot.empty) {
      const activitiesData = activitiesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orgId: orgId,
          type: data.type || 'unknown',
          status: data.status || 'pending',
          summary: data.summary || null,
          amount: data.amount ? String(data.amount) : null,
          customerPhone: data.customerPhone || null,
          assignedStaffPhone: data.assignedStaffPhone || null,
          metadata: data.metadata || data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };
      });
      
      await pgDb.insert(activities).values(activitiesData).onConflictDoNothing();
      totalActivities += activitiesData.length;
      console.log(`  -> Migrated ${activitiesData.length} activities for org: ${orgId}`);
    }
  }

  console.log(`\n✅ Migration Complete!`);
  console.log(`   - Total Products Migrated: ${totalProducts}`);
  console.log(`   - Total Activities Migrated: ${totalActivities}`);
  console.log(`⚠️ Next Step: Delete @naija-agent/firebase imports from apps/worker and switch to Drizzle queries.`);
  process.exit(0);
}

migrate().catch(e => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});
