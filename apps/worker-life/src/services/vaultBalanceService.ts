import { getDb, users, transactions, sql } from '@naija-agent/database';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export class VaultBalanceService {
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
          await tx.update(users).set({ vaultBalanceKobo: newBalance, updatedAt: new Date() }).where(sql`${users.phone} = ${phone}` as any);
        }

        if (reference && reference.toLowerCase() !== 'unknown') {
          await tx.insert(transactions).values({
            id: randomUUID(),
            userId: phone,
            type: `vault_${type}`,
            amount: (amountKobo / 100).toString(),
            currency: 'NGN',
            status: 'success',
            reference,
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
        await tx.update(users).set({ vaultBalanceKobo: newBalance, updatedAt: new Date() }).where(sql`${users.phone} = ${phone}` as any);
      });

      return newBalance;
    } catch (e: any) {
      logger.warn({ phone, error: e.message }, 'Vault deduction failed');
      return null;
    }
  }
}

export const vaultBalanceService = new VaultBalanceService();
