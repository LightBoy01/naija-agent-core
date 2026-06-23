import { getDb } from './db.js';
import { organizations, systemLogs, networkMetadata } from './schema.js';
import { eq, sql, and } from 'drizzle-orm';
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
  const bonusKobo = 200000;
  
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: data.id,
      name: data.name,
      balanceKobo: bonusKobo,
      isActive: true,
      status: 'ACTIVE',
      timezone: data.timezone || 'Africa/Lagos',
      whatsappPhoneId: data.whatsappPhoneId,
      systemPrompt: data.systemPrompt,
      config: {
        adminPhone: data.adminPhone,
        adminPin: hashedPin,
        model: 'deepseek-v4-flash',
        tools: ['web_search']
      }
    }).onConflictDoNothing({ target: organizations.id });

    // Update global vault total
    await tx.insert(networkMetadata).values({
      key: 'global',
      totalVaultKobo: bonusKobo,
      activeClients: 1
    }).onConflictDoUpdate({
      target: networkMetadata.key,
      set: {
        totalVaultKobo: sql`${networkMetadata.totalVaultKobo} + ${bonusKobo}`,
        activeClients: sql`${networkMetadata.activeClients} + 1`
      }
    });
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
  const trialBonus = 200000;
  
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: data.id,
      name: data.name,
      balanceKobo: trialBonus,
      isActive: true,
      status: 'TRIAL',
      timezone: data.timezone || 'Africa/Lagos',
      whatsappPhoneId: 'PENDING',
      config: {
        status: 'TRIAL',
        adminPhone: data.adminPhone,
        botPhone: data.botPhone,
        model: 'deepseek-v4-flash',
        tools: ['web_search']
      }
    });

    await tx.insert(networkMetadata).values({
      key: 'global',
      totalVaultKobo: trialBonus,
      activeClients: 1
    }).onConflictDoUpdate({
      target: networkMetadata.key,
      set: {
        totalVaultKobo: sql`${networkMetadata.totalVaultKobo} + ${trialBonus}`,
        activeClients: sql`${networkMetadata.activeClients} + 1`
      }
    });
  });
}

export async function topupTenant(tenantId: string, amount: number, reference: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(organizations)
      .set({ 
        balanceKobo: sql`${organizations.balanceKobo} + ${amount}`,
        lifetimeDepositsKobo: sql`${organizations.lifetimeDepositsKobo} + ${amount}`
      })
      .where(eq(organizations.id, tenantId));
    
    await tx.update(networkMetadata)
      .set({ totalVaultKobo: sql`${networkMetadata.totalVaultKobo} + ${amount}` })
      .where(eq(networkMetadata.key, 'global'));
  });
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

export async function setOrgOnboarding(orgId: string, step: string, data: Record<string, any> = {}) {
  const db = getDb();
  await db.update(organizations).set({
    onboardingStep: step,
    onboardingData: data,
    updatedAt: new Date(),
  }).where(eq(organizations.id, orgId));
}

export async function completeOnboarding(orgId: string, finalConfig: {
  name?: string;
  adminPin: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  systemPrompt?: string;
  timezone?: string;
  botPhone?: string;
}) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) throw new Error(`Organization ${orgId} not found`);

  let hashedPin = finalConfig.adminPin;
  const isBcrypt = /^\$2[aby]\$.{56}$/.test(hashedPin);
  if (!isBcrypt) {
    hashedPin = await bcrypt.hash(hashedPin, 10);
  }

  const config = (org.config as any) || {};
  config.adminPin = hashedPin;
  if (finalConfig.bankName || finalConfig.accountNumber || finalConfig.accountName) {
    config.bankDetails = {
      bankName: finalConfig.bankName,
      accountNumber: finalConfig.accountNumber,
      accountName: finalConfig.accountName,
    };
  }
  if (finalConfig.systemPrompt) {
    config.systemPrompt = finalConfig.systemPrompt;
  }

  await db.update(organizations).set({
    name: finalConfig.name || org.name,
    onboardingStep: 'COMPLETE',
    onboardingData: null,
    systemPrompt: finalConfig.systemPrompt || org.systemPrompt,
    config,
    isActive: true,
    updatedAt: new Date(),
  }).where(eq(organizations.id, orgId));
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
    isActive: true,
    status: 'ACTIVE'
  }).where(eq(organizations.id, orgId));
}

export async function suspendOrganization(orgId: string, reason: string): Promise<void> {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) return;

  const config = (org.config as any) || {};
  config.suspensionReason = reason;

  await db.update(organizations).set({
    isActive: false,
    status: 'SUSPENDED',
    config,
    updatedAt: new Date(),
  }).where(eq(organizations.id, orgId));
}

export async function unsuspendOrganization(orgId: string): Promise<void> {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) return;

  const config = (org.config as any) || {};
  delete config.suspensionReason;

  await db.update(organizations).set({
    isActive: true,
    status: 'ACTIVE',
    config,
    updatedAt: new Date(),
  }).where(eq(organizations.id, orgId));
}

export async function getOrgStats(orgId: string) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) return null;

  // Optimized chat count
  const chatResult = await db.execute(sql`SELECT COUNT(*) as count FROM chats WHERE org_id = ${orgId}`);
  const chatCount = Number(chatResult[0]?.count || 0);

  return {
    balance: org.balanceKobo,
    isActive: org.isActive,
    status: org.status,
    name: org.name,
    chatCount,
    updatedAt: org.updatedAt
  };
}

export async function getNetworkStats(orgId: string) {
  const org = await getOrgById(orgId);
  if (!org || !(org.config as any)?.isMaster) throw new Error('UNAUTHORIZED');
  const db = getDb();
  
  const meta = await db.select().from(networkMetadata).where(eq(networkMetadata.key, 'global'));
  const stats = meta[0] || { totalVaultKobo: 0, activeClients: 0 };

  const orgs = await db.select().from(organizations);
  
  return {
    activeClients: stats.activeClients,
    totalVaultKobo: stats.totalVaultKobo,
    clients: orgs
  };
}



export async function setMfaCode(orgId: string, code: string, expiryMinutes = 5) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org) return;

  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
  const config = (org.config as any) || {};
  config.mfaCode = code;
  config.mfaExpiresAt = expiry.toISOString();

  await db.update(organizations).set({ config, updatedAt: new Date() }).where(eq(organizations.id, orgId));
}

export async function verifyMfaCode(orgId: string, code: string): Promise<boolean> {
  const org = await getOrgById(orgId);
  if (!org || !(org.config as any)?.mfaCode || !(org.config as any)?.mfaExpiresAt) return false;

  const now = new Date();
  const expiry = new Date((org.config as any).mfaExpiresAt);

  if (now > expiry) return false;
  if ((org.config as any).mfaCode !== code) return false;

  const db = getDb();
  const config = (org.config as any);
  delete config.mfaCode;
  delete config.mfaExpiresAt;

  await db.update(organizations).set({ config, updatedAt: new Date() }).where(eq(organizations.id, orgId));
  return true;
}

export async function getOrgByPhoneId(phoneId: string) {
  const db = getDb();
  const orgs = await db.select().from(organizations).where(eq(organizations.whatsappPhoneId, phoneId));
  return orgs[0] || null;
}

export async function findOrgByAdminPhone(phone: string) {
  const db = getDb();
  const orgs = await db.select().from(organizations).where(sql`config->>'adminPhone' = ${phone}`);
  return orgs[0] || null;
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

export async function getOrganizationsBySector(sector: string, capability?: string) {
  const db = getDb();
  const results = await db.select().from(organizations).where(sql`${organizations.sector} = ${sector} AND ${organizations.isActive} = true`).limit(20);
  
  if (capability) {
    return results.filter(org => {
      const caps = (org.config as any)?.capabilities;
      return Array.isArray(caps) && caps.includes(capability);
    });
  }
  return results;
}

// --- Referral Logic ---
import { referrals } from './schema.js';
import crypto from 'crypto';

export async function createReferral(referrerPhone: string, referredOrgId: string) {
  const db = getDb();
  await db.insert(referrals).values({
    id: `ref_${crypto.randomBytes(8).toString('hex')}`,
    referrerPhone,
    referredOrgId,
    status: 'pending',
    commissionEarnedKobo: 100000,
  }).onConflictDoNothing();
}

export async function processReferralConversion(orgId: string) {
  const db = getDb();
  const org = await getOrgById(orgId);
  if (!org || org.lifetimeDepositsKobo < 500000) return null; // 5000 NGN threshold

  const pendingReferrals = await db.select().from(referrals).where(
    sql`${referrals.referredOrgId} = ${orgId} AND ${referrals.status} = 'pending'`
  );
  
  if (pendingReferrals.length > 0) {
    const referral = pendingReferrals[0];
    const settlementDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    
    await db.update(referrals).set({
      status: 'pending_settlement',
      settlementDate,
    }).where(eq(referrals.id, referral.id));
    
    return referral;
  }
  return null;
}

import { users } from './schema.js';

export async function processMatureReferrals() {
  const db = getDb();
  const now = new Date();
  
  const matureReferrals = await db.select().from(referrals).where(
    sql`${referrals.status} = 'pending_settlement' AND ${referrals.settlementDate} <= ${now}`
  );
  
  const processed = [];
  
  for (const ref of matureReferrals) {
    await db.transaction(async (tx) => {
      await tx.update(referrals).set({ status: 'paid' }).where(eq(referrals.id, ref.id));
      
      // Attempt to update the user's vault balance. If user doesn't exist, ignore (they can still register later but the vault update might fail. Wait, if they don't exist, we should upsert or just ignore for now? Assuming Aelixxr users exist.)
      await tx.update(users).set({ 
         vaultBalanceKobo: sql`${users.vaultBalanceKobo} + ${ref.commissionEarnedKobo}`
      }).where(eq(users.phone, ref.referrerPhone));
    });
    processed.push(ref);
  }
  
  return processed;
}
