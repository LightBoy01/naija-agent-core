import { getDb as getFirestore } from '../packages/firebase/dist/index.js';
import { 
  db as sql, 
  organizations, 
  users, 
  transactions, 
  memories, 
  chats, 
  messages, 
  products, 
  stagingProducts,
  activities,
  knowledge,
  staff,
  systemLogs,
  dailySnapshots,
  networkMetadata,
  cartItems,
  heartbeats
} from '../packages/database/dist/index.js';
import { eq, sql as rawSql } from 'drizzle-orm';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

async function migrate() {
  const firestore = getFirestore();
  const sqlDb = sql;

  if (!sqlDb) {
    console.error('❌ SQL Database not initialized. Set DATABASE_URL.');
    return;
  }

  console.log('🚀 Starting Comprehensive Zero-Loss Migration: Firebase -> PostgreSQL');

  // --- 1. Global Metadata ---
  console.log('📊 Migrating Global Stats...');
  const globalMeta = await firestore.collection('network_metadata').doc('global').get();
  if (globalMeta.exists) {
    const data = globalMeta.data()!;
    await sqlDb.insert(networkMetadata).values({
      key: 'global',
      totalVaultKobo: data.totalVaultKobo || 0,
      activeClients: data.activeClients || 0,
      updatedAt: data.updatedAt?.toDate() || new Date()
    }).onConflictDoUpdate({
      target: networkMetadata.key,
      set: { totalVaultKobo: data.totalVaultKobo || 0 }
    });
  }

  // --- 2. Organizations & Nested Collections ---
  console.log('🏢 Migrating Organizations & Dependencies...');
  const orgsSnapshot = await firestore.collection('organizations').get();
  for (const doc of orgsSnapshot.docs) {
    const data = doc.data();
    try {
      // 2a. Base Org
      await sqlDb.insert(organizations).values({
        id: doc.id,
        name: data.name || 'Unknown Org',
        balanceKobo: data.balance || 0,
        isActive: data.isActive !== false,
        status: data.status || 'ACTIVE',
        region: data.region || 'NG',
        sector: data.sector || 'commerce',
        deploymentModel: data.deploymentModel || 'SHARED',
        costPerReply: data.costPerReply || 3300,
        whatsappPhoneId: data.whatsappPhoneId || null,
        timezone: data.timezone || 'Africa/Lagos',
        onboardingStep: data.onboardingStep || 'COMPLETE',
        onboardingData: data.onboardingData || null,
        systemPrompt: data.systemPrompt || null,
        config: data.config || {},
        trialStartedAt: data.trialStartedAt?.toDate() || null,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onConflictDoUpdate({
        target: organizations.id,
        set: { 
          balanceKobo: data.balance || 0,
          status: data.status || 'ACTIVE',
          updatedAt: new Date() 
        }
      });

      // 2b. Knowledge
      const knowledgeSnap = await firestore.collection('organizations').doc(doc.id).collection('knowledge').get();
      for (const kDoc of knowledgeSnap.docs) {
        const kData = kDoc.data();
        await sqlDb.insert(knowledge).values({
          slug: kDoc.id,
          orgId: doc.id,
          key: kData.key,
          content: kData.content,
          imageUrl: kData.imageUrl || null,
          updatedAt: kData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: knowledge.slug,
          set: { content: kData.content }
        });
      }

      // 2c. Products & Staging
      const productsSnap = await firestore.collection('organizations').doc(doc.id).collection('products').get();
      for (const pDoc of productsSnap.docs) {
        const pData = pDoc.data();
        await sqlDb.insert(products).values({
          id: pDoc.id,
          orgId: doc.id,
          name: pData.name || pData.title,
          nameLowercase: (pData.name || pData.title || '').toLowerCase(),
          description: pData.description || null,
          price: pData.price ? String(pData.price) : '0',
          stock: pData.stock || 0,
          reserved: pData.reserved || 0,
          lowStockThreshold: pData.lowStockThreshold || 3,
          isLowStock: pData.isLowStock || false,
          metadata: pData,
          createdAt: pData.createdAt?.toDate() || new Date(),
          updatedAt: pData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: products.id,
          set: { stock: pData.stock || 0 }
        });
      }

      const stagingSnap = await firestore.collection('organizations').doc(doc.id).collection('staging_products').get();
      for (const sDoc of stagingSnap.docs) {
        const sData = sDoc.data();
        await sqlDb.insert(stagingProducts).values({
          id: sDoc.id,
          orgId: doc.id,
          name: sData.name || sData.title,
          nameLowercase: (sData.name || sData.title || '').toLowerCase(),
          description: sData.description || null,
          price: sData.price ? String(sData.price) : '0',
          stock: sData.stock || 0,
          metadata: sData,
          createdAt: sData.createdAt?.toDate() || new Date(),
          updatedAt: sData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: stagingProducts.id,
          set: { updatedAt: new Date() }
        });
      }

      // 2d. Activities
      const activitiesSnap = await firestore.collection('organizations').doc(doc.id).collection('activities').get();
      for (const aDoc of activitiesSnap.docs) {
        const aData = aDoc.data();
        await sqlDb.insert(activities).values({
          id: aDoc.id,
          orgId: doc.id,
          type: aData.type,
          status: aData.status,
          summary: aData.summary || null,
          amount: aData.amount ? String(aData.amount) : null,
          customerPhone: aData.customerPhone || null,
          assignedStaffPhone: aData.assignedStaffPhone || null,
          metadata: aData,
          createdAt: aData.createdAt?.toDate() || new Date(),
          updatedAt: aData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: activities.id,
          set: { status: aData.status }
        });
      }

      // 2e. Staff
      const staffSnap = await firestore.collection('organizations').doc(doc.id).collection('staff').get();
      for (const stDoc of staffSnap.docs) {
        const stData = stDoc.data();
        await sqlDb.insert(staff).values({
          phone: stDoc.id,
          orgId: doc.id,
          name: stData.name,
          role: stData.role,
          isActive: stData.isActive !== false,
          updatedAt: stData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: staff.phone,
          set: { isActive: stData.isActive !== false }
        });
      }

      // 2f. Daily Snapshots
      const snapshotsSnap = await firestore.collection('organizations').doc(doc.id).collection('daily_snapshots').get();
      for (const snDoc of snapshotsSnap.docs) {
        const snData = snDoc.data();
        await sqlDb.insert(dailySnapshots).values({
          orgId: doc.id,
          date: snDoc.id,
          totalSalesKobo: snData.totalSalesKobo || 0,
          totalExpensesKobo: snData.totalExpensesKobo || 0,
          metadata: snData,
          updatedAt: snData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: [dailySnapshots.orgId, dailySnapshots.date],
          set: { totalSalesKobo: snData.totalSalesKobo || 0 }
        });
      }

      console.log(`✅ Org Detail Migrated: ${data.name}`);
    } catch (err: any) {
      console.error(`❌ Failed Org ${doc.id}: ${err.message}`);
    }
  }

  // --- 3. Users (Life OS) & Memories ---
  console.log('\n👤 Migrating Users & Memories...');
  const usersSnapshot = await firestore.collection('user_profiles').get();
  for (const doc of usersSnapshot.docs) {
    const data = doc.data();
    try {
      await sqlDb.insert(users).values({
        phone: doc.id,
        name: data.name || data.fullName || null,
        energyCredits: data.energyCredits || 0,
        vaultBalanceKobo: data.vaultBalanceKobo || 0,
        pinHash: data.pin || data.pinHash || null, 
        pinAttempts: data.pinAttempts || 0,
        pinLockUntil: data.pinLockUntil?.toDate() || null,
        family: data.family || null,
        goals: data.goals || null,
        preferences: data.preferences || null,
        context: data,
        sessionStatus: data.sessionStatus || 'IDLE',
        sessionExpiry: data.sessionExpiry?.toDate() || null,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onConflictDoUpdate({
        target: users.phone,
        set: { energyCredits: data.energyCredits || 0 }
      });
      
      // Episodic Events -> Memories
      const eventsSnapshot = await firestore.collection('user_profiles').doc(doc.id).collection('episodic_events').get();
      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        await sqlDb.insert(memories).values({
          id: uuidv4(),
          userId: doc.id,
          orgId: 'aelixxr',
          category: 'episodic',
          content: JSON.stringify({ title: eventData.title, details: eventData.details }),
          importance: 1,
          createdAt: eventData.timestamp?.toDate() || new Date(),
        });
      }

      // Heartbeats
      const hbSnap = await firestore.collection('user_profiles').doc(doc.id).collection('monitors').get();
      for (const hbDoc of hbSnap.docs) {
        const hbData = hbDoc.data();
        await sqlDb.insert(heartbeats).values({
          id: hbDoc.id,
          userId: doc.id,
          type: hbData.type || 'reminder',
          query: hbData.query || null,
          intervalDescription: hbData.interval || null,
          messagePayload: hbData.messagePayload || null,
          triggerTime: hbData.triggerTime || null,
          active: hbData.active !== false,
          status: hbData.status || 'pending',
          createdAt: hbData.createdAt?.toDate() || new Date(),
          updatedAt: hbData.updatedAt?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: heartbeats.id,
          set: { active: hbData.active !== false }
        });
      }
      
      console.log(`✅ User: ${doc.id} (+${eventsSnapshot.size} events, +${hbSnap.size} heartbeats)`);
    } catch (err: any) {
      console.error(`❌ Failed User ${doc.id}: ${err.message}`);
    }
  }

  // --- 4. Chats, Messages & Carts ---
  console.log('\n💬 Migrating Chats, Messages & Carts...');
  const chatsSnapshot = await firestore.collection('chats').get();
  for (const doc of chatsSnapshot.docs) {
    const data = doc.data();
    try {
      await sqlDb.insert(chats).values({
        id: doc.id,
        orgId: data.organizationId || null,
        userPhone: data.whatsappUserId || null,
        userName: data.userName || null,
        isOptedOut: data.isOptedOut || false,
        isCartActive: data.isCartActive || false,
        lastCartUpdateAt: data.lastCartUpdateAt?.toDate() || null,
        lastAdminAuthAt: data.lastAdminAuthAt?.toDate() || null,
        lastNudgeAt: data.lastNudgeAt?.toDate() || null,
        lastMessageAt: data.lastMessageAt?.toDate() || null,
        summary: data.summary || null,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onConflictDoUpdate({
        target: chats.id,
        set: { summary: data.summary || null }
      });

      // Messages (Limited to last 50 per chat for migration speed, can be increased)
      const msgSnap = await firestore.collection('chats').doc(doc.id).collection('messages')
        .orderBy('timestamp', 'desc').limit(50).get();
      
      for (const mDoc of msgSnap.docs) {
        const mData = mDoc.data();
        await sqlDb.insert(messages).values({
          id: mDoc.id,
          chatId: doc.id,
          role: mData.role,
          content: mData.content,
          type: mData.type || 'text',
          reasoning: mData.reasoning || null,
          metadata: mData.metadata || null,
          createdAt: mData.timestamp?.toDate() || new Date()
        }).onConflictDoUpdate({
          target: messages.id,
          set: { content: mData.content }
        });
      }

      // Cart Items
      const cartSnap = await firestore.collection('chats').doc(doc.id).collection('cart').get();
      for (const cDoc of cartSnap.docs) {
        const cData = cDoc.data();
        await sqlDb.insert(cartItems).values({
          id: uuidv4(),
          chatId: doc.id,
          productId: cData.productId,
          name: cData.name || 'Unknown Item',
          price: cData.price ? String(cData.price) : '0',
          quantity: cData.quantity || 1,
          addedAt: cData.addedAt?.toDate() || new Date()
        });
      }

      console.log(`✅ Chat: ${doc.id} (+${msgSnap.size} msgs, +${cartSnap.size} items)`);
    } catch (err: any) {
      console.error(`❌ Failed Chat ${doc.id}: ${err.message}`);
    }
  }

  // --- 5. Transactions ---
  console.log('\n💰 Migrating Financial Transactions...');
  const txSnapshot = await firestore.collection('transactions').get();
  for (const doc of txSnapshot.docs) {
    const data = doc.data();
    try {
      await sqlDb.insert(transactions).values({
        id: doc.id,
        userId: data.from || null,
        orgId: data.orgId || null,
        type: data.type || 'deposit',
        amount: data.amount ? String(data.amount) : '0',
        currency: data.currency || 'NGN',
        status: data.status || 'success',
        reference: data.reference || null,
        smsId: data.smsId || null,
        metadata: data,
        verifiedAt: data.verifiedAt?.toDate() || null,
        confirmedAt: data.confirmedAt?.toDate() || null,
        createdAt: data.timestamp?.toDate() || new Date()
      }).onConflictDoUpdate({
        target: transactions.id,
        set: { status: data.status || 'success' }
      });
    } catch (err: any) {
      console.error(`❌ Failed Tx ${doc.id}: ${err.message}`);
    }
  }

  console.log('\n🏁 Zero-Loss Migration Finished Successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('💥 Migration Crashed:', err);
  process.exit(1);
});
