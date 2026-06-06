import { db as firebaseDb } from '../../packages/firebase/src/db.js';
import { db as pgDb } from '../../packages/database/src/db.js';
import { 
  organizations,
  products, 
  activities, 
  knowledge, 
  staff, 
  chats, 
  cartItems 
} from '../../packages/database/src/schema.js';

async function migrate() {
  console.log('🚀 Starting The Great Firebase Purge (Migration)');
  
  if (!pgDb) {
    throw new Error('❌ PostgreSQL Database not initialized. Ensure DATABASE_URL is set in .env');
  }

  // 1. Migrate Products
  console.log('📦 Migrating Products...');
  const orgsSnapshot = await firebaseDb.collection('organizations').get();
  let totalProducts = 0;
  let totalActivities = 0;
  let totalKnowledge = 0;
  let totalStaff = 0;
  let totalCarts = 0;

  for (const org of orgsSnapshot.docs) {
    const orgId = org.id;
    const orgRef = org.ref;
    const orgData = org.data();

    // 0. Migrate Organization
    try {
      await pgDb.insert(organizations).values({
        id: orgId,
        name: orgData.name || 'Unnamed Org',
        phone: orgData.phone || '000000000',
        industry: orgData.industry || 'general',
        isActive: orgData.isActive !== false,
      }).onConflictDoNothing();
    } catch (e) {
      console.warn(`Failed to insert org ${orgId}:`, e.message);
    }

    // 1. Migrate Products
    const productsSnapshot = await orgRef.collection('products').get();
    if (!productsSnapshot.empty) {
      const productsData = productsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orgId: orgId,
          name: data.name || data.title,
          nameLowercase: (data.name || data.title || '').toLowerCase(),
          description: data.description || null,
          price: data.price ? String(data.price) : null,
          stock: data.stock || 0,
          reserved: data.reserved || 0,
          lowStockThreshold: data.lowStockThreshold || 3,
          isLowStock: (data.stock || 0) <= (data.lowStockThreshold || 3),
          metadata: data,
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      });

      await pgDb.insert(products).values(productsData).onConflictDoNothing();
      totalProducts += productsData.length;
      console.log(`  -> Migrated ${productsData.length} products for org: ${orgId}`);
    }

    // 2. Migrate Activities
    const activitiesSnapshot = await orgRef.collection('activities').get();
    if (!activitiesSnapshot.empty) {
      const activitiesData = activitiesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          orgId: orgId,
          type: data.type || 'booking',
          status: data.status || 'pending',
          summary: data.summary || null,
          amount: data.amount ? String(data.amount) : null,
          customerPhone: data.customerPhone || null,
          assignedStaffPhone: data.assignedStaffPhone || null,
          metadata: data.metadata || data,
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      });

      await pgDb.insert(activities).values(activitiesData).onConflictDoNothing();
      totalActivities += activitiesData.length;
      console.log(`  -> Migrated ${activitiesData.length} activities for org: ${orgId}`);
    }

    // 3. Migrate Knowledge
    const knowledgeSnapshot = await orgRef.collection('knowledge').get();
    if (!knowledgeSnapshot.empty) {
      const knowledgeData = knowledgeSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          slug: doc.id,
          orgId: orgId,
          key: data.key || doc.id,
          content: data.content || '',
          imageUrl: data.imageUrl || null,
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      });

      await pgDb.insert(knowledge).values(knowledgeData).onConflictDoNothing();
      totalKnowledge += knowledgeData.length;
      console.log(`  -> Migrated ${knowledgeData.length} knowledge items for org: ${orgId}`);
    }

    // 4. Migrate Staff
    const staffSnapshot = await orgRef.collection('staff').get();
    if (!staffSnapshot.empty) {
      const staffData = staffSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          phone: doc.id,
          orgId: orgId,
          name: data.name || 'Staff',
          role: data.role || 'assistant',
          isActive: data.isActive !== false,
          updatedAt: data.updatedAt?.toDate() || new Date()
        };
      });

      await pgDb.insert(staff).values(staffData).onConflictDoNothing();
      totalStaff += staffData.length;
      console.log(`  -> Migrated ${staffData.length} staff for org: ${orgId}`);
    }
  }

  // 5. Migrate Carts
  console.log('\n🛒 Migrating Active Carts...');
  const chatsSnapshot = await firebaseDb.collection('chats').where('isCartActive', '==', true).get();
  for (const chatDoc of chatsSnapshot.docs) {
    const cartSnapshot = await chatDoc.ref.collection('cart').get();
    if (!cartSnapshot.empty) {
      const cartData = cartSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          chatId: chatDoc.id,
          productId: doc.id,
          name: data.name || 'Product',
          price: data.price ? String(data.price) : '0',
          quantity: data.quantity || 1,
          addedAt: data.addedAt?.toDate() || new Date()
        };
      });

      try {
        await pgDb.insert(chats).values({
          id: chatDoc.id,
          orgId: chatDoc.data().organizationId || 'naija-agent-master',
          userPhone: chatDoc.data().whatsappUserId || 'unknown',
          userName: chatDoc.data().userName || 'unknown',
          isOptedOut: false,
          isCartActive: true
        }).onConflictDoNothing();
        
        await pgDb.insert(cartItems).values(cartData).onConflictDoNothing();
        totalCarts += cartData.length;
      } catch (e) {
        console.error(`Failed to migrate cart for ${chatDoc.id}:`, e.message);
      }
    }
  }

  console.log(`\n✅ Migration Complete!`);
  console.log(`   - Total Products Migrated: ${totalProducts}`);
  console.log(`   - Total Activities Migrated: ${totalActivities}`);
  console.log(`   - Total Knowledge Migrated: ${totalKnowledge}`);
  console.log(`   - Total Staff Migrated: ${totalStaff}`);
  console.log(`   - Total Cart Items Migrated: ${totalCarts}`);
  console.log(`⚠️ Next Step: Delete @naija-agent/firebase imports from apps/worker and switch to Drizzle queries.`);
  process.exit(0);
}

migrate().catch(e => {
  console.error('❌ Migration failed:', e);
  process.exit(1);
});
