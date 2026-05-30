import { getDb } from './db.js';
import { organizations } from './schema.js';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

export async function createTenant(data: {
  id: string;
  name: string;
  whatsappPhoneId: string;
  adminPhone: string;
  adminPin: string;
  systemPrompt: string;
  timezone?: string;
}) {
  const db = getDb();
  const hashedPin = await bcrypt.hash(data.adminPin, 10);
  const bridgeSecret = crypto.randomBytes(16).toString('hex');
  const bonusKobo = 100000;
  
  await db.insert(organizations).values({
    id: data.id,
    name: data.name,
    balanceKobo: bonusKobo,
    isActive: true,
    timezone: data.timezone || 'Africa/Lagos',
    whatsappPhoneId: data.whatsappPhoneId,
    systemPrompt: data.systemPrompt,
    config: {
      adminPhone: data.adminPhone,
      adminPin: hashedPin,
      bridgeSecret,
      useSmsBridge: true,
      model: 'gemma-4-26b-a4b-it',
      tools: ['web_search']
    }
  });
}

export async function registerTrialInterest(data: {
  id: string;
  name: string;
  adminPhone: string;
  botPhone: string;
  timezone?: string;
}) {
  const db = getDb();
  const trialBonus = 100000;
  
  await db.insert(organizations).values({
    id: data.id,
    name: data.name,
    balanceKobo: trialBonus,
    isActive: true,
    timezone: data.timezone || 'Africa/Lagos',
    whatsappPhoneId: 'PENDING',
    config: {
      status: 'TRIAL',
      adminPhone: data.adminPhone,
      botPhone: data.botPhone,
      model: 'gemma-4-26b-a4b-it',
      tools: ['web_search']
    }
  });
}

export async function topupTenant(tenantId: string, amount: number, reference: string) {
  const db = getDb();
  await db.update(organizations)
    .set({ balanceKobo: sql`${organizations.balanceKobo} + ${amount}` })
    .where(eq(organizations.id, tenantId));
}

export async function getActiveOrganizations() {
  const db = getDb();
  return await db.select().from(organizations).where(eq(organizations.isActive, true));
}

export async function getOrgById(orgId: string) {
  const db = getDb();
  const orgs = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return orgs[0] || null;
}

export async function getAllOrgs() {
  const db = getDb();
  return await db.select().from(organizations);
}

export async function getPendingSetups() {
  const db = getDb();
  return await db.select().from(organizations).where(eq(organizations.whatsappPhoneId, 'PENDING'));
}

export async function activateTenant(orgId: string, phoneId: string, accessToken: string) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) throw new Error(`Organization ${orgId} not found`);
  
  const config = (org.config as any) || {};
  config.whatsappToken = accessToken;
  
  await db.update(organizations).set({
    whatsappPhoneId: phoneId,
    config,
    isActive: true
  }).where(eq(organizations.id, orgId));
}

export async function getOrgStats(orgId: string) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) return null;
  return {
    balance: org.balanceKobo,
    isActive: org.isActive,
    updatedAt: org.updatedAt
  };
}

export async function getNetworkStats(orgId: string) {
  if (orgId !== 'naija-agent-master') throw new Error('UNAUTHORIZED');
  const db = getDb();
  const orgs = await db.select().from(organizations);
  let totalVaultKobo = 0;
  orgs.forEach(o => totalVaultKobo += o.balanceKobo);
  return {
    activeClients: orgs.filter(o => o.isActive).length,
    totalVaultKobo,
    clients: orgs
  };
}

export async function logSystemEvent(orgId: string, eventType: string, summary: string, metadata: any = {}) {
  console.log(`[SYSTEM EVENT] ${orgId} - ${eventType}: ${summary}`);
}

export async function setMfaCode(orgId: string, code: string) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) return;
  const config = (org.config as any) || {};
  config.mfaCode = code;
  await db.update(organizations).set({ config }).where(eq(organizations.id, orgId));
}

export async function getOrgByPhoneId(phoneId: string) {
  const db = getDb();
  const orgs = await db.select().from(organizations).where(eq(organizations.whatsappPhoneId, phoneId));
  return orgs[0] || null;
}

export async function getOrgByBridgeSecret(secret: string) {
  const db = getDb();
  const orgs = await db.select().from(organizations);
  return orgs.find(o => (o.config as any)?.bridgeSecret === secret) || null;
}

export async function findOrgByAdminPhone(phone: string) {
  const db = getDb();
  // Simplified for SQLite/Postgres hybrid testing; ideal to use JSONB extraction in raw Postgres
  const orgs = await db.select().from(organizations);
  return orgs.find(o => (o.config as any)?.adminPhone === phone) || null;
}

export async function getOrgDailyStats(orgId: string, dateStr: string) {
  // Placeholder for Postgres implementation of daily stats
  return { salesKobo: 0, expensesKobo: 0, pendingActivities: 0, newCustomers: 0 };
}

// Transaction Logic
import { transactions } from './schema.js';

export async function findPendingTransaction(orgId: string, reference: string) {
  const db = getDb();
  const txs = await db.select().from(transactions).where(sql`${transactions.orgId} = ${orgId} AND ${transactions.reference} = ${reference} AND ${transactions.status} = 'pending'`);
  return txs[0] || null;
}

export async function confirmTransaction(orgId: string, reference: string, amountPaidKobo: number) {
  const db = getDb();
  await db.update(transactions)
    .set({ status: 'success' })
    .where(sql`${transactions.orgId} = ${orgId} AND ${transactions.reference} = ${reference}`);
  // Also topup the org balance based on the payment
  await topupTenant(orgId, amountPaidKobo, reference);
}
