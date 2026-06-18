import { getDb, users, energyLedger, transactions, eq, sql } from '@naija-agent/database';
import { parseAndFormatPhone } from '@naija-agent/types';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export class EnergyService {
  async deductEnergy(phone: string, amount: number, reason?: string, jobId?: string): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let safePhone = parseAndFormatPhone(phone) || phone;
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        let userResult = await tx.select().from(users).where(sql`${users.phone} = ${safePhone}` as any);
        let user = userResult[0];
        
        // Fallback: try raw phone if safePhone normalizes differently (e.g. old non-E.164 rows)
        if (!user && safePhone !== phone) {
          userResult = await tx.select().from(users).where(sql`${users.phone} = ${phone}` as any);
          user = userResult[0];
          if (user) safePhone = phone;
        }
        
        if (!user) throw new Error('User profile not found in Database');

        const currentBalance = user.energyCredits;
        if (currentBalance < amount && (currentBalance - amount < -2)) {
          throw new Error(`Insufficient energy: ${currentBalance} < ${amount}`);
        }

        newBalance = currentBalance - amount;
        
        await tx.update(users)
          .set({ energyCredits: newBalance, updatedAt: new Date() })
          .where(sql`${users.phone} = ${safePhone}` as any);

        // Write immutable audit entry
        await tx.insert(energyLedger).values({
          id: randomUUID(),
          userId: safePhone,
          amount: -amount,
          reason: reason || 'deduction',
          balanceAfter: newBalance,
          jobId: jobId || null,
        });
      });

      return newBalance;
    } catch (e: any) {
      logger.warn({ phone, error: e.message }, 'Energy deduction failed');
      return null;
    }
  }

  async addEnergy(phone: string, amount: number, reference?: string, reason?: string): Promise<number | null> {
    try {
      const sqlDb = getDb();
      let safePhone = parseAndFormatPhone(phone) || phone;
      let newBalance: number | null = null;

      await sqlDb.transaction(async (tx) => {
        if (reference && reference.toLowerCase() !== 'unknown') {
          const txExists = await tx.select().from(transactions).where(sql`${transactions.reference} = ${reference}` as any).limit(1);
          if (txExists.length > 0) throw new Error('DUPLICATE_REFERENCE');
        }

        let userResult = await tx.select().from(users).where(sql`${users.phone} = ${safePhone}` as any);
        let user = userResult[0];

        // Fallback: try raw phone if safePhone normalizes differently
        if (!user && safePhone !== phone) {
          userResult = await tx.select().from(users).where(sql`${users.phone} = ${phone}` as any);
          user = userResult[0];
          if (user) safePhone = phone;
        }

        if (!user) {
          await tx.insert(users).values({ phone: safePhone, energyCredits: amount });
          newBalance = amount;
        } else {
          newBalance = user.energyCredits + amount;
          await tx.update(users).set({ energyCredits: newBalance, updatedAt: new Date() }).where(sql`${users.phone} = ${safePhone}` as any);
        }

        // Write immutable audit entry
        await tx.insert(energyLedger).values({
          id: randomUUID(),
          userId: safePhone,
          amount: amount,
          reason: reason || 'topup',
          balanceAfter: newBalance,
          reference: reference || null,
        });

        if (reference && reference.toLowerCase() !== 'unknown') {
          await tx.insert(transactions).values({
            id: randomUUID(),
            userId: safePhone,
            type: 'energy_topup',
            amount: amount.toString(),
            currency: 'CREDITS',
            status: 'success',
            reference,
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
}

export const energyService = new EnergyService();
