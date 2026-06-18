import { getDb, users, sql } from '@naija-agent/database';
import { LifeContext, parseAndFormatPhone } from '@naija-agent/types';
import { logger } from '../utils/logger.js';

export class UserService {
  async getContext(phone: string): Promise<LifeContext> {
    try {
      if (!phone || phone.trim() === '') {
        logger.warn('getContext called with empty phone, returning empty context');
        return {};
      }
      const sqlDb = getDb();
      const safePhone = parseAndFormatPhone(phone) || phone;
      const userResult = await sqlDb.select().from(users).where(sql`${users.phone} = ${safePhone}` as any).limit(1);
      
      let user = userResult[0];
      
      if (!user) {
        await sqlDb.insert(users).values({
          phone: safePhone,
          name: 'User',
          energyCredits: 100,
          vaultBalanceKobo: 0,
          context: {}
        });
        logger.info({ phone }, '🎁 New user registered in Database! Granted 100 Welcome Bonus Credits.');
        await this.completeReferral(phone);

        user = {
          phone, name: '', energyCredits: 0, vaultBalanceKobo: 0,
          pinHash: null, pinLockUntil: null, pinAttempts: 0,
          context: {}, sessionStatus: null, sessionExpiry: null,
          createdAt: new Date(), updatedAt: new Date()
        } as any;
      }

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

  async checkExists(phone: string): Promise<boolean> {
    try {
      const sqlDb = getDb();
      const safePhone = parseAndFormatPhone(phone) || phone;
      const userResult = await sqlDb.select({ phone: users.phone }).from(users).where(sql`${users.phone} = ${safePhone}` as any).limit(1);
      return userResult.length > 0;
    } catch {
      return false;
    }
  }

  async updateContext(phone: string, updates: Partial<LifeContext>): Promise<void> {
    try {
      const sqlDb = getDb();
      const safePhone = parseAndFormatPhone(phone) || phone;
      const userResult = await sqlDb.select({ context: users.context }).from(users).where(sql`${users.phone} = ${safePhone}` as any).limit(1);
      if (userResult[0]) {
        const currentContext = userResult[0].context as Record<string, any> || {};
        const sqlUpdates: any = { 
          context: { ...currentContext, ...updates },
          updatedAt: new Date()
        };
        if (updates.pinAttempts !== undefined) sqlUpdates.pinAttempts = updates.pinAttempts;
        if (updates.pinLockUntil !== undefined) sqlUpdates.pinLockUntil = updates.pinLockUntil;
        await sqlDb.update(users).set(sqlUpdates).where(sql`${users.phone} = ${safePhone}` as any);
      }
      logger.info({ phone, updates }, '💾 Updated Life Memory (PostgreSQL)');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to update Life Context');
    }
  }

  async createReferral(referrerPhone: string, referredPhoneRaw: string): Promise<string | null> {
    const sqlDb = getDb();
    const { randomUUID } = await import('crypto');
    const { referrals } = await import('@naija-agent/database');
    const referralId = randomUUID();
    const referredPhone = parseAndFormatPhone(referredPhoneRaw) || referredPhoneRaw.replace(/\D/g, '');

    try {
      const existingUser = await sqlDb.select().from(users).where(sql`${users.phone} = ${referredPhone}` as any).limit(1);
      if (existingUser.length > 0) {
        logger.info({ referrerPhone, referredPhone }, '🚫 Referral failed: User already exists');
        return null;
      }
      await sqlDb.insert(referrals).values({
        id: referralId, referrerPhone, referredPhone,
        status: 'pending', rewardAmount: 50
      });
      logger.info({ referrerPhone, referredPhone }, '🔗 Referral created');
      return referralId;
    } catch (e: any) {
      logger.error({ error: e.message }, 'Failed to create referral');
      return null;
    }
  }

  async completeReferral(newUserIdRaw: string): Promise<void> {
    const sqlDb = getDb();
    const { randomUUID } = await import('crypto');
    const { referrals, transactions } = await import('@naija-agent/database');
    const newUserId = parseAndFormatPhone(newUserIdRaw) || newUserIdRaw;

    try {
      const pendingResult = await sqlDb.select()
        .from(referrals)
        .where(sql`${referrals.referredPhone} = ${newUserId} AND ${referrals.status} = 'pending'` as any)
        .limit(1);

      const pending = pendingResult[0];
      if (pending) {
        await sqlDb.transaction(async (tx) => {
          await tx.update(referrals)
            .set({ status: 'rewarded', completedAt: new Date() })
            .where(sql`${referrals.id} = ${pending.id}` as any);

          const referrerResult = await tx.select({ currentEnergy: users.energyCredits })
            .from(users)
            .where(sql`${users.phone} = ${pending.referrerPhone}` as any);
          
          if (referrerResult[0]) {
            const newEnergy = referrerResult[0].currentEnergy + pending.rewardAmount;
            await tx.update(users)
              .set({ energyCredits: newEnergy, updatedAt: new Date() })
              .where(sql`${users.phone} = ${pending.referrerPhone}` as any);

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
}

export const userService = new UserService();
