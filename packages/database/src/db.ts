import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
import { organizations, transactions } from './schema.js';
import { eq, sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// CommonJS/ESM safe dirname resolution
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

dotenv.config({ path: path.resolve(currentDir, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL;

// Path to the CA certificate
const caPath = path.resolve(currentDir, '../isrgrootx1.pem');
const sslConfig = fs.existsSync(caPath) 
  ? { ssl: { ca: fs.readFileSync(caPath) } }
  : {};

export const connection = DATABASE_URL 
  ? mysql.createPool({
      uri: DATABASE_URL,
      database: 'test',
      ...sslConfig
    })
  : null;

export const db = connection 
  ? drizzle(connection, { schema, mode: 'default' }) 
  : null;

/**
 * Helper to ensure DB is available before executing queries.
 */
export function getDb() {
  if (!db) {
    throw new Error('❌ SQL Database not initialized. Ensure DATABASE_URL is set.');
  }
  return db;
}

// --- ORGANIZATIONAL FINANCIALS (PHASE 9.3) ---

/**
 * Atomic balance addition for an Organization.
 */
export async function addOrgBalance(orgId: string, amountKobo: number): Promise<number | null> {
  const sqlDb = getDb();
  try {
    let newBalance: number | null = null;
    await sqlDb.transaction(async (tx) => {
      const result = await tx.select({ balanceKobo: organizations.balanceKobo })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for('update');
      
      if (result.length === 0) throw new Error('Organization not found');
      
      newBalance = (result[0].balanceKobo || 0) + amountKobo;
      
      await tx.update(organizations)
        .set({ balanceKobo: newBalance })
        .where(eq(organizations.id, orgId));
    });
    return newBalance;
  } catch (e) {
    console.error(`[DB] addOrgBalance failed for ${orgId}:`, e);
    return null;
  }
}

/**
 * Atomic balance deduction for an Organization.
 */
export async function deductOrgBalance(orgId: string, amountKobo: number): Promise<number | null> {
  const sqlDb = getDb();
  try {
    let newBalance: number | null = null;
    await sqlDb.transaction(async (tx) => {
      const result = await tx.select({ balanceKobo: organizations.balanceKobo })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for('update');
      
      if (result.length === 0) throw new Error('Organization not found');
      
      const currentBalance = result[0].balanceKobo || 0;
      if (currentBalance < amountKobo) {
        throw new Error('Insufficient balance');
      }
      
      newBalance = currentBalance - amountKobo;
      
      await tx.update(organizations)
        .set({ balanceKobo: newBalance })
        .where(eq(organizations.id, orgId));
    });
    return newBalance;
  } catch (e) {
    console.error(`[DB] deductOrgBalance failed for ${orgId}:`, e);
    return null;
  }
}

/**
 * Top-up an Organization with idempotency and transaction logging.
 */
export async function topupOrg(orgId: string, amountNaira: number, reference: string): Promise<{ newBalance: number } | null> {
  const sqlDb = getDb();
  const amountKobo = Math.round(amountNaira * 100);
  
  try {
    let newBalance: number | null = null;
    await sqlDb.transaction(async (tx) => {
      // 1. Idempotency Check
      const txExists = await tx.select().from(transactions).where(eq(transactions.reference, reference)).limit(1);
      if (txExists.length > 0) throw new Error('DUPLICATE_REFERENCE');

      // 2. Fetch & Lock
      const result = await tx.select({ balanceKobo: organizations.balanceKobo })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for('update');
      
      if (result.length === 0) throw new Error('Organization not found');

      newBalance = (result[0].balanceKobo || 0) + amountKobo;

      // 3. Update Balance
      await tx.update(organizations)
        .set({ balanceKobo: newBalance })
        .where(eq(organizations.id, orgId));

      // 4. Log Transaction
      await tx.insert(transactions).values({
        id: randomUUID(),
        orgId: orgId,
        type: 'topup',
        amount: amountNaira.toFixed(2),
        currency: 'NGN',
        status: 'success',
        reference: reference
      });
    });

    return { newBalance: newBalance! };
  } catch (e: any) {
    console.warn(`[DB] topupOrg failed for ${orgId}:`, e.message);
    if (e.message === 'DUPLICATE_REFERENCE') throw e;
    return null;
  }
}

export * from './schema.js';
