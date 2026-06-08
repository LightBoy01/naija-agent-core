import { getDb as getFirestore } from '../packages/firebase/dist/index.js';
import { 
  db as sql, 
  organizations, 
  users, 
  chats, 
  transactions,
  products
} from '../packages/database/dist/index.js';
import { sql as rawSql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

console.log(`🔗 DB_URL: ${process.env.DATABASE_URL?.split('@')[1]}`);

async function audit() {
  const firestore = getFirestore();
  const sqlDb = sql;

  console.log('🔍 Starting Migration Integrity Audit...');

  // 1. Organizations Count
  const fbOrgs = await firestore.collection('organizations').get();
  const sqlOrgs = await sqlDb.select().from(organizations);
  console.log(`🏢 Orgs: Firebase(${fbOrgs.size}) vs SQL(${sqlOrgs.length}) - ${fbOrgs.size === sqlOrgs.length ? '✅ OK' : '⚠️ MISMATCH'}`);

  // 2. Users Count
  const fbUsers = await firestore.collection('user_profiles').get();
  const sqlUsers = await sqlDb.select().from(users);
  console.log(`👤 Users: Firebase(${fbUsers.size}) vs SQL(${sqlUsers.length}) - ${fbUsers.size === sqlUsers.length ? '✅ OK' : '⚠️ MISMATCH'}`);

  // 3. Chats Count
  const fbChats = await firestore.collection('chats').get();
  const sqlChats = await sqlDb.select().from(chats);
  console.log(`💬 Chats: Firebase(${fbChats.size}) vs SQL(${sqlChats.length}) - ${fbChats.size <= sqlChats.length ? '✅ OK' : '⚠️ MISMATCH'}`);

  // 4. Financial Check (Sum of Org Balances)
  let fbTotalBalance = 0;
  fbOrgs.forEach(doc => fbTotalBalance += (doc.data().balance || 0));
  
  let sqlTotalBalance = 0;
  sqlOrgs.forEach(org => sqlTotalBalance += org.balanceKobo);
  
  console.log(`💰 Balances: FB(${fbTotalBalance}) vs SQL(${sqlTotalBalance}) - ${fbTotalBalance === sqlTotalBalance ? '✅ OK' : '⚠️ MISMATCH'}`);

  // 5. Sample Integrity Check (aelixxr user)
  const aelixxrSql = sqlUsers.find(u => u.phone === '2347042310893');
  if (aelixxrSql) {
    const aelixxrFb = await firestore.collection('user_profiles').doc('2347042310893').get();
    const fbData = aelixxrFb.data()!;
    console.log(`🧬 Sample Check (Aelixxr): Energy Credits Match? ${aelixxrSql.energyCredits === fbData.energyCredits ? '✅ YES' : '❌ NO'}`);
  }

  console.log('\n🏁 Audit Finished.');
  process.exit(0);
}

audit().catch(err => {
  console.error('💥 Audit Failed:', err);
  process.exit(1);
});
