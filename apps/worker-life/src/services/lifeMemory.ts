import { getDb, users, transactions, referrals, memories, eq, sql, and, desc } from '@naija-agent/database';
import { LifeContext, parseAndFormatPhone } from '@naija-agent/types';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export class LifeMemoryService {
  private collection = 'life_contexts';

  /**
   * Hybrid Get Context: 
   * Fetches financial data from PostgreSQL, merges with semantic context.
   */
  async getContext(phone: string): Promise<LifeContext> {
    try {
      const sqlDb = getDb();
      const userResult = await sqlDb.select().from(users).where(sql`${users.phone} = ${phone}` as any).limit(1);
      
      let user = userResult[0];
      
      if (!user) {
        // --- NEW USER REGISTRATION ---
        await sqlDb.insert(users).values({
          phone: phone,
          name: 'User',
          energyCredits: 100,
          vaultBalanceKobo: 0,
          context: {}
        });
        logger.info({ phone }, '🎁 New user registered in Database! Granted 100 Welcome Bonus Credits.');
        
        // --- CHECK FOR REFERRAL (VIRAL LOOP) ---
        await this.completeReferral(phone);

        user = {
          phone: phone,
          name: '',
          energyCredits: 0,
          vaultBalanceKobo: 0,
          pinHash: null,
          pinLockUntil: null,
          pinAttempts: 0,
          context: {},
          sessionStatus: null,
          sessionExpiry: null,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any;
      }

      // Merge with any legacy or NoSQL-only context fields
      const noSqlContext = user.context as Record<string, any> || {};

      return {
        ...noSqlContext,
        energyCredits: user.energyCredits,
        vaultBalanceKobo: user.vaultBalanceKobo,
        pinLockUntil: user.pinLockUntil || undefined,
        pinHash: user.pinHash || undefined,
        lastInteraction: user.updatedAt,
        sessionStatus: user.sessionStatus || undefined,
        sessionExpiry: user.sessionExpiry || undefined
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
      const existingUser = await sqlDb.select().from(users).where(sql`${users.phone} = ${referredPhone}` as any).limit(1);
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
        .where(sql`${referrals.referredPhone} = ${newUserId} AND ${referrals.status} = 'pending'` as any)
        .limit(1);

      const pending = pendingResult[0];
      if (pending) {
        await sqlDb.transaction(async (tx) => {
          // 1. Mark referral as completed
          await tx.update(referrals)
            .set({ status: 'rewarded', completedAt: new Date() })
            .where(sql`${referrals.id} = ${pending.id}` as any);

          // 2. Reward the Referrer
          const referrerResult = await tx.select({ currentEnergy: users.energyCredits })
            .from(users)
            .where(sql`${users.phone} = ${pending.referrerPhone}` as any);
          
          if (referrerResult[0]) {
             const newEnergy = referrerResult[0].currentEnergy + pending.rewardAmount;
             await tx.update(users)
               .set({ energyCredits: newEnergy })
               .where(sql`${users.phone} = ${pending.referrerPhone}` as any);

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
        const userResult = await tx.select().from(users).where(sql`${users.phone} = ${phone}` as any);
        const user = userResult[0];
        
        if (!user) throw new Error('User profile not found in Database');

        const currentBalance = user.energyCredits;
        if (currentBalance < amount && (currentBalance - amount < -2)) {
          throw new Error(`Insufficient energy: ${currentBalance} < ${amount}`);
        }

        newBalance = currentBalance - amount;
        
        await tx.update(users)
          .set({ energyCredits: newBalance })
          .where(sql`${users.phone} = ${phone}` as any);
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
            const txExists = await tx.select().from(transactions).where(sql`${transactions.reference} = ${reference}` as any).limit(1);
            if (txExists.length > 0) {
                throw new Error('DUPLICATE_REFERENCE');
            }
        }

        const userResult = await tx.select().from(users).where(sql`${users.phone} = ${phone}` as any);
        let user = userResult[0];

        if (!user) {
            // Auto-create user
            await tx.insert(users).values({ phone, energyCredits: amount });
            newBalance = amount;
        } else {
            newBalance = user.energyCredits + amount;
            await tx.update(users).set({ energyCredits: newBalance }).where(sql`${users.phone} = ${phone}` as any);
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

  async addVaultBalance(phone: string, amountKobo: number, reference?: string, type: 'deposit' | 'refund' = 'deposit'): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        if (reference && reference.toLowerCase() !== 'unknown') {
            const txExists = await tx.select().from(transactions).where(sql`${transactions.reference} = ${reference}` as any).limit(1);
            if (txExists.length > 0) throw new Error('DUPLICATE_REFERENCE');
        }

        const userResult = await tx.select().from(users).where(sql`${users.phone} = ${phone}` as any);
        let user = userResult[0];

        if (!user) {
            newBalance = amountKobo;
            await tx.insert(users).values({ phone, vaultBalanceKobo: amountKobo });
        } else {
            const currentBalance = user.vaultBalanceKobo || 0;
            newBalance = currentBalance + amountKobo;
            await tx.update(users).set({ vaultBalanceKobo: newBalance }).where(sql`${users.phone} = ${phone}` as any);
        }

        if (reference && reference.toLowerCase() !== 'unknown') {
             await tx.insert(transactions).values({
                id: randomUUID(),
                userId: phone,
                type: `vault_${type}`,
                amount: (amountKobo / 100).toString(), // Store as Naira string in decimal column
                currency: 'NGN',
                status: 'success',
                reference: reference
            });
        }
      });

      logger.info({ phone, addedKobo: amountKobo, newBalanceKobo: newBalance, reference }, '🏦 Vault Deposit Successful');
      return newBalance;
    } catch (e: any) {
      if (e.message === 'DUPLICATE_REFERENCE') throw e; 
      logger.warn({ phone, error: e.message }, 'Vault deposit failed');
      return null;
    }
  }

  async deductVaultBalance(phone: string, amountKobo: number): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        const userResult = await tx.select().from(users).where(sql`${users.phone} = ${phone}` as any);
        const user = userResult[0];
        
        if (!user) throw new Error('User profile not found in Database');

        const currentBalance = user.vaultBalanceKobo || 0;

        if (currentBalance < amountKobo) {
          throw new Error('Insufficient funds in Vault: ' + currentBalance + ' < ' + amountKobo + ' Kobo');
        }

        newBalance = currentBalance - amountKobo;
        await tx.update(users).set({ vaultBalanceKobo: newBalance }).where(sql`${users.phone} = ${phone}` as any);
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
      const userResult = await sqlDb.select({ phone: users.phone }).from(users).where(sql`${users.phone} = ${phone}` as any).limit(1);
      return userResult.length > 0;
    } catch (error: any) {
      return false;
    }
  }

  // --- NoSQL HYBRID REMAINDERS ---

  async updateContext(phone: string, updates: Partial<LifeContext>): Promise<void> {
    try {
      // Update the JSON context in SQL directly
      const sqlDb = getDb();
      const userResult = await sqlDb.select({ context: users.context }).from(users).where(sql`${users.phone} = ${phone}` as any).limit(1);
      if (userResult[0]) {
         const currentContext = userResult[0].context as Record<string, any> || {};
         const sqlUpdates: any = { 
           context: { ...currentContext, ...updates },
           updatedAt: new Date()
         };

         if (updates.pinAttempts !== undefined) sqlUpdates.pinAttempts = updates.pinAttempts;
         if (updates.pinLockUntil !== undefined) sqlUpdates.pinLockUntil = updates.pinLockUntil;

         await sqlDb.update(users).set(sqlUpdates).where(sql`${users.phone} = ${phone}` as any);
      }

      logger.info({ phone, updates }, '💾 Updated Life Memory (PostgreSQL)');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to update Life Context');
    }
  }

  async saveEpisodicEvent(phone: string, title: string, details: string, emotionalValence: string = 'neutral'): Promise<void> {
    try {
      const sqlDb = getDb();
      await sqlDb.insert(memories).values({
        id: randomUUID(),
        userId: phone,
        orgId: 'LightBoy01', // TODO: Make orgId dynamic if episodic events are org-scoped
        category: 'episodic',
        content: JSON.stringify({ title, details, emotionalValence }),
        embedding: null, // Nullable vector
        importance: 1
      });
      logger.info({ phone, title, emotionalValence }, '📖 Saved Episodic Event to PostgreSQL (memories)');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to save Episodic Event');
    }
  }

  async getRecentEpisodicEvents(phone: string, limitNum: number = 5): Promise<any[]> {
    try {
      const sqlDb = getDb();
      const results = await sqlDb.select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, phone),
            eq(memories.category, 'episodic')
          )
        )
        .orderBy(desc(memories.createdAt))
        .limit(limitNum);
        
      return results.map(row => JSON.parse(row.content)).reverse();
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Episodic Events');
      return [];
    }
  }

  // --- SEMANTIC MEMORY (PHASE 9.4: LONG-TERM RETRIEVAL) ---

  async saveSemanticMemory(userId: string, orgId: string, category: string, content: string, embedding: number[], importance: number = 1): Promise<void> {
    try {
      const sqlDb = getDb();
      const { memories } = await import('@naija-agent/database');
      await sqlDb.insert(memories).values({
        id: randomUUID(),
        userId,
        orgId,
        category,
        content,
        embedding: sql`${'[' + embedding.join(',') + ']' }::vector` as any,
        importance
      });
      logger.info({ userId, category }, '🧠 Saved Semantic Memory to PostgreSQL (pgvector)');
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Failed to save Semantic Memory');
    }
  }

  async searchSemanticMemory(userId: string, embedding: number[], limit: number = 5): Promise<any[]> {
    try {
      const sqlDb = getDb();
      const { memories } = await import('@naija-agent/database');
      
      // Vector Similarity Search using cosine distance (<=>)
      const results = await sqlDb.select()
        .from(memories)
        .where(sql`${memories.userId} = ${userId}` as any)
        .orderBy(sql`${memories.embedding} <=> ${'[' + embedding.join(',') + ']'}` as any)
        .limit(limit);
        
      return results;
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Failed to search Semantic Memory');
      return [];
    }
  }
}

export const lifeMemory = new LifeMemoryService();
