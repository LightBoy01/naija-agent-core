import { db } from '../packages/firebase/dist/index.js';
import { users, organizations } from '../packages/database/dist/schema.js';
import { db as sqlDb } from '../packages/database/dist/db.js';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

async function migrateOrganizations() {
  logger.info('🏢 Starting Organizations Migration...');
  const snapshot = await db.collection('organizations').get();
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    try {
      await sqlDb.insert(organizations).values({
        id: doc.id,
        name: data.name || 'Unknown Org',
        balanceKobo: data.balance || 0,
        isActive: data.isActive !== false,
        region: data.region || 'NG',
        sector: data.sector || 'commerce',
        whatsappPhoneId: data.whatsappPhoneId,
        timezone: data.timezone || 'Africa/Lagos',
        config: data.config,
        systemPrompt: data.systemPrompt,
        // Firestore Timestamp to JS Date
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onDuplicateKeyUpdate({
        set: {
          balanceKobo: data.balance || 0,
          isActive: data.isActive !== false,
          config: data.config,
          updatedAt: new Date()
        }
      });
      logger.info(`✅ Migrated Org: ${doc.id}`);
    } catch (err: any) {
      logger.error(`❌ Failed Org ${doc.id}: ${err.message}`);
    }
  }
}

async function migrateLifeUsers() {
  logger.info('🧑‍💻 Starting Life OS Users Migration...');
  const snapshot = await db.collection('_life').get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    // In Firestore, the _life document ID is typically the phone number.
    const phone = doc.id; 
    
    // Normalize pinLockUntil
    let pinLockUntilDate: Date | null = null;
    if (data.pinLockUntil) {
      if (typeof data.pinLockUntil.toDate === 'function') {
        pinLockUntilDate = data.pinLockUntil.toDate();
      } else if (typeof data.pinLockUntil === 'string') {
        pinLockUntilDate = new Date(data.pinLockUntil);
      }
    }

    try {
      await sqlDb.insert(users).values({
        phone: phone,
        name: data.name || 'User',
        energyCredits: data.energyCredits ?? 100,
        vaultBalanceNaira: (data.vaultBalanceNaira || 0).toString(),
        pinHash: data.pinHash || null,
        pinLockUntil: pinLockUntilDate,
        pinAttempts: data.pinAttempts || 0,
        context: { goals: data.goals, preferences: data.preferences },
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      }).onDuplicateKeyUpdate({
        set: {
          energyCredits: data.energyCredits ?? 100,
          vaultBalanceNaira: (data.vaultBalanceNaira || 0).toString(),
          pinHash: data.pinHash || null,
          context: { goals: data.goals, preferences: data.preferences },
          updatedAt: new Date()
        }
      });
      logger.info(`✅ Migrated User: ${phone}`);
    } catch (err: any) {
      logger.error(`❌ Failed User ${phone}: ${err.message}`);
    }
  }
}

async function main() {
  logger.info('🚀 Initiating Hybrid Database Migration (Firebase -> TiDB)');
  
  if (!process.env.DATABASE_URL) {
    logger.error('CRITICAL: Missing DATABASE_URL (TiDB endpoint)');
    process.exit(1);
  }

  try {
    await migrateOrganizations();
    await migrateLifeUsers();
    logger.info('🎉 Migration completed safely!');
    process.exit(0);
  } catch (e: any) {
    logger.error(`🚨 Fatal Migration Error: ${e.message}`);
    process.exit(1);
  }
}

main();