import { getDb as getFirestore } from '@naija-agent/firebase';
import { getDb, users, transactions, referrals } from '@naija-agent/database';
import { eq, sql, and } from 'drizzle-orm';
import { LifeContext, parseAndFormatPhone } from '@naija-agent/types';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export class LifeMemoryService {
  /**
   * Hybrid Get Context: 
   * Fetches financial data from PostgreSQL, merges with semantic context.
   */
  async getContext(phone: string): Promise<LifeContext> {
    try {
      const sqlDb = getDb();
      const userResult = await sqlDb.select().from(users).where(eq(users.phone, phone)).limit(1);
      
      let user = userResult[0];
      
      if (!user) {
        // --- NEW USER REGISTRATION ---
        await sqlDb.insert(users).values({
          phone: phone,
          name: 'User',
          energyCredits: 100,
          vaultBalanceNaira: '0.00',
          context: {}
        });
        logger.info({ phone }, '🎁 New user registered in Database! Granted 100 Welcome Bonus Credits.');
        
        // --- CHECK FOR REFERRAL (VIRAL LOOP) ---
        await this.completeReferral(phone);

        user = {
          phone,
          name: 'User',
          energyCredits: 100,
          vaultBalanceNaira: '0.00',
          pinHash: null,
          pinLockUntil: null,
          pinAttempts: 0,
          context: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      // Merge with any legacy or NoSQL-only context fields
      const noSqlContext = user.context as Record<string, any> || {};

      return {
        ...noSqlContext,
        energyCredits: user.energyCredits,
        vaultBalanceNaira: parseFloat(user.vaultBalanceNaira as string) || 0,
        pinLockUntil: user.pinLockUntil,
        pinHash: user.pinHash,
        lastInteraction: user.updatedAt
      };
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Life Context from Database');
      return {};
    }
  }

  // --- REFERRAL METHODS (PHASE 4) ---

  /**
   * Create a pending referral record.
   */
  async createReferral(referrerPhone: string, referredPhoneRaw: string): Promise<string | null> {
    const sqlDb = getDb();
    const referralId = randomUUID();
    
    // STRICT NORMALIZATION: Ensure E.164 format.
    const referredPhone = parseAndFormatPhone(referredPhoneRaw) || referredPhoneRaw.replace(/\D/g, '');

    try {
      // Check if user already exists
      const existingUser = await sqlDb.select().from(users).where(eq(users.phone, referredPhone)).limit(1);
      if (existingUser.length > 0) {
        logger.info({ referrerPhone, referredPhone }, '🚫 Referral failed: User already exists');
        return null;
      }

      await sqlDb.insert(referrals).values({
        id: referralId,
        referrerPhone,
        referredPhone,
        status: 'pending',
        rewardAmount: 50 // Energy Credits bonus
      });
      logger.info({ referrerPhone, referredPhone }, '🔗 Referral created');
      return referralId;
    } catch (e: any) {
      logger.error({ error: e.message }, 'Failed to create referral');
      return null;
    }
  }

  /**
   * Completes any pending referrals for a new user and rewards the referrer.
   */
  async completeReferral(newUserIdRaw: string): Promise<void> {
    const sqlDb = getDb();
    const newUserId = parseAndFormatPhone(newUserIdRaw) || newUserIdRaw;

    try {
      // Find pending referrals for this new user
      const pendingResult = await sqlDb.select()
        .from(referrals)
        .where(and(eq(referrals.referredPhone, newUserId), eq(referrals.status, 'pending')))
        .limit(1);

      const pending = pendingResult[0];
      if (pending) {
        await sqlDb.transaction(async (tx) => {
          // 1. Mark referral as completed
          await tx.update(referrals)
            .set({ status: 'rewarded', completedAt: new Date() })
            .where(eq(referrals.id, pending.id));

          // 2. Reward the Referrer
          const referrerResult = await tx.select({ currentEnergy: users.energyCredits })
            .from(users)
            .where(eq(users.phone, pending.referrerPhone));
          
          if (referrerResult[0]) {
             const newEnergy = referrerResult[0].currentEnergy + pending.rewardAmount;
             await tx.update(users)
               .set({ energyCredits: newEnergy })
               .where(eq(users.phone, pending.referrerPhone));

             // 3. Log Reward Transaction
             await tx.insert(transactions).values({
               id: randomUUID(),
               userId: pending.referrerPhone,
               type: 'referral_reward',
               amount: pending.rewardAmount.toString(),
               currency: 'CREDITS',
               status: 'success',
               reference: `REF_${pending.id}`
             });
             
             logger.info({ referrer: pending.referrerPhone, amount: pending.rewardAmount }, '🎁 Referrer Rewarded!');
          }
        });
      }
    } catch (e: any) {
      logger.error({ error: e.message }, 'Failed to complete referral');
    }
  }

  async deductEnergy(phone: string, amount: number): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        const userResult = await tx.select().from(users).where(eq(users.phone, phone));
        const user = userResult[0];
        
        if (!user) throw new Error('User profile not found in Database');

        const currentBalance = user.energyCredits;
        if (currentBalance < amount && (currentBalance - amount < -2)) {
          throw new Error(`Insufficient energy: ${currentBalance} < ${amount}`);
        }

        newBalance = currentBalance - amount;
        
        await tx.update(users)
          .set({ energyCredits: newBalance })
          .where(eq(users.phone, phone));
      });

      return newBalance;
    } catch (e: any) {
      logger.warn({ phone, error: e.message }, 'Energy deduction failed');
      return null;
    }
  }

  async addEnergy(phone: string, amount: number, reference?: string): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        // Idempotency Check
        if (reference && reference.toLowerCase() !== 'unknown') {
            const txExists = await tx.select().from(transactions).where(eq(transactions.reference, reference)).limit(1);
            if (txExists.length > 0) {
                throw new Error('DUPLICATE_REFERENCE');
            }
        }

        const userResult = await tx.select().from(users).where(eq(users.phone, phone));
        let user = userResult[0];

        if (!user) {
            // Auto-create user
            await tx.insert(users).values({ phone, energyCredits: amount });
            newBalance = amount;
        } else {
            newBalance = user.energyCredits + amount;
            await tx.update(users).set({ energyCredits: newBalance }).where(eq(users.phone, phone));
        }

        // Log transaction
        if (reference && reference.toLowerCase() !== 'unknown') {
            await tx.insert(transactions).values({
                id: randomUUID(),
                userId: phone,
                type: 'energy_topup',
                amount: amount.toString(),
                currency: 'CREDITS',
                status: 'success',
                reference: reference
            });
        }
      });

      logger.info({ phone, added: amount, newBalance, reference }, '🔋 Energy Added Successfully');
      return newBalance;
    } catch (e: any) {
      if (e.message === 'DUPLICATE_REFERENCE') {
          logger.warn({ phone, reference }, 'Blocked duplicate energy top-up attempt');
          throw e; 
      }
      logger.warn({ phone, error: e.message }, 'Energy addition failed');
      return null;
    }
  }

  async addVaultBalance(phone: string, amountNaira: number, reference?: string, type: 'deposit' | 'refund' = 'deposit'): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        if (reference && reference.toLowerCase() !== 'unknown') {
            const txExists = await tx.select().from(transactions).where(eq(transactions.reference, reference)).limit(1);
            if (txExists.length > 0) throw new Error('DUPLICATE_REFERENCE');
        }

        const userResult = await tx.select().from(users).where(eq(users.phone, phone));
        let user = userResult[0];

        if (!user) {
            newBalance = amountNaira;
            await tx.insert(users).values({ phone, vaultBalanceNaira: amountNaira.toString() });
        } else {
            const currentBalance = parseFloat(user.vaultBalanceNaira as string) || 0;
            newBalance = currentBalance + amountNaira;
            await tx.update(users).set({ vaultBalanceNaira: newBalance.toFixed(2) }).where(eq(users.phone, phone));
        }

        if (reference && reference.toLowerCase() !== 'unknown') {
             await tx.insert(transactions).values({
                id: randomUUID(),
                userId: phone,
                type: `vault_${type}`,
                amount: amountNaira.toString(),
                currency: 'NGN',
                status: 'success',
                reference: reference
            });
        }
      });

      logger.info({ phone, added: amountNaira, newBalance, reference }, '🏦 Vault Deposit Successful');
      return newBalance;
    } catch (e: any) {
      if (e.message === 'DUPLICATE_REFERENCE') throw e; 
      logger.warn({ phone, error: e.message }, 'Vault deposit failed');
      return null;
    }
  }

  async deductVaultBalance(phone: string, amountNaira: number): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        const userResult = await tx.select().from(users).where(eq(users.phone, phone));
        const user = userResult[0];
        
        if (!user) throw new Error('User profile not found in Database');

        const currentBalance = parseFloat(user.vaultBalanceNaira as string) || 0;

        if (currentBalance < amountNaira) {
          throw new Error('Insufficient funds in Vault: NGN' + currentBalance + ' < NGN' + amountNaira);
        }

        newBalance = currentBalance - amountNaira;
        await tx.update(users).set({ vaultBalanceNaira: newBalance.toFixed(2) }).where(eq(users.phone, phone));
      });

      return newBalance;
    } catch (e: any) {
      logger.warn({ phone, error: e.message }, 'Vault deduction failed');
      return null;
    }
  }

  async checkExists(phone: string): Promise<boolean> {
    try {
      const sqlDb = getDb();
      const userResult = await sqlDb.select({ phone: users.phone }).from(users).where(eq(users.phone, phone)).limit(1);
      return userResult.length > 0;
    } catch (error: any) {
      return false;
    }
  }

  // --- NoSQL HYBRID REMAINDERS ---

  async updateContext(phone: string, updates: Partial<LifeContext>): Promise<void> {
    try {
      // Semantic updates still go to Firebase NoSQL for now
      const db = getFirestore();
      await db.collection(this.collection).doc(phone).set({
        ...updates,
        lastInteraction: new Date()
      }, { merge: true });
      
      // Also update the JSON context in SQL for hybrid sync
      const sqlDb = getDb();
      const userResult = await sqlDb.select({ context: users.context }).from(users).where(eq(users.phone, phone)).limit(1);
      if (userResult[0]) {
         const currentContext = userResult[0].context as Record<string, any> || {};
         await sqlDb.update(users).set({ context: { ...currentContext, ...updates } }).where(eq(users.phone, phone));
      }

      logger.info({ phone, updates }, '💾 Updated Life Memory (Hybrid Sync)');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to update Life Context');
    }
  }

  async saveEpisodicEvent(phone: string, title: string, details: string, emotionalValence: string = 'neutral'): Promise<void> {
    try {
      // Episodic events remain purely NoSQL
      const db = getFirestore();
      const event = { title, details, emotionalValence, timestamp: new Date() };
      await db.collection(this.collection).doc(phone).collection('episodic_events').add(event);
      logger.info({ phone, title, emotionalValence }, '📖 Saved Episodic Event to Firebase Vault History');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to save Episodic Event');
    }
  }

  async getRecentEpisodicEvents(phone: string, limit: number = 5): Promise<any[]> {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection).doc(phone).collection('episodic_events')
        .orderBy('timestamp', 'desc').limit(limit).get();
      return snapshot.docs.map(doc => doc.data()).reverse();
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Episodic Events');
      return [];
    }
  }
}

export const lifeMemory = new LifeMemoryService();
