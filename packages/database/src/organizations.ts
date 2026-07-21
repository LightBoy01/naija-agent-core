import { getDb } from './db.js';
import { organizations, systemLogs, networkMetadata, transactions, users, referrals } from './schema.js';
import { eq, sql, and } from 'drizzle-orm';
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
  let hashedPin = data.adminPin;
  const isBcrypt = /^\$2[aby]\$.{56}$/.test(hashedPin);
  if (!isBcrypt) {
    hashedPin = await bcrypt.hash(hashedPin, 10);
  }
  const bonusKobo = 10000; // 100 NGN (10 Credits)
  
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
  referralPhone?: string;
  isBetaCohort?: boolean;
  betaExpiresAt?: Date;
}) {
  const db = getDb();
  // 10,000 Kobo (10 Credits) for organic, 50,000 Kobo (50 Credits) for referred
  const trialBonus = data.referralPhone ? 50000 : 10000;
  
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: data.id,
      name: data.name,
      balanceKobo: trialBonus,
      isActive: true,
      status: 'TRIAL',
      timezone: data.timezone || 'Africa/Lagos',
      whatsappPhoneId: 'PENDING',
      isBetaCohort: data.isBetaCohort || false,
      betaExpiresAt: data.betaExpiresAt || null,
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

    if (data.referralPhone) {
      await createReferral(data.referralPhone, data.id);
    }
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
  
  const { topupOrg } = await import('./db.js');
  await topupOrg(orgId, amountPaidKobo / 100, reference);
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

import { parseAndFormatPhone } from '@naija-agent/types';

export async function getPartnerStatus(phone: string): Promise<{ isPartner: boolean, isBeta: boolean }> {
  const db = getDb();
  const normalized = parseAndFormatPhone(phone) || phone;
  const orgs = await db.select().from(organizations).where(
    sql`config->>'adminPhone' = ${normalized} AND ${organizations.isActive} = true`
  );
  if (orgs.length === 0) return { isPartner: false, isBeta: false };
  return { isPartner: true, isBeta: orgs[0].isBetaPartner };
}

export async function isRegisteredPartner(phone: string): Promise<boolean> {
  const status = await getPartnerStatus(phone);
  return status.isPartner;
}

export async function createReferral(referrerPhone: string, referredOrgId: string) {
  const db = getDb();
  const normalized = parseAndFormatPhone(referrerPhone) || referrerPhone;
  
  // Self-Referral Block (Red Team Mitigation)
  const org = await db.select().from(organizations).where(eq(organizations.id, referredOrgId));
  if (org.length > 0) {
    const adminPhone = (org[0].config as any)?.adminPhone;
    if (adminPhone && (parseAndFormatPhone(adminPhone) || adminPhone) === normalized) {
      console.warn(`[FRAUD GUARD] Blocked self-referral attempt. Admin ${normalized} tried to refer their own org ${referredOrgId}`);
      return; // Silently fail to prevent wash trading
    }
  }

  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
  await db.insert(referrals).values({
    id: `ref_${crypto.randomBytes(8).toString('hex')}`,
    referrerPhone: normalized,
    referredOrgId,
    status: 'active',
    commissionEarnedKobo: 0,
    expiresAt
  }).onConflictDoNothing();
}

export async function getPartnerStats(referrerPhone: string) {
  const db = getDb();
  const partnerReferrals = await db.select().from(referrals).where(
    eq(referrals.referrerPhone, referrerPhone)
  );

  let activeCount = 0;
  let totalEarnedKobo = 0;
  const now = new Date();

  for (const ref of partnerReferrals) {
    if (ref.status === 'active' && ref.expiresAt && new Date(ref.expiresAt) > now) {
      activeCount++;
    }
    totalEarnedKobo += ref.commissionEarnedKobo;
  }

  // Calculate cleared commissions (older than 7 days)
  const clearedThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pendingCommissions = await db.select().from(transactions).where(
    sql`${transactions.userId} = ${referrerPhone} AND ${transactions.type} = 'commission_pending' AND ${transactions.status} = 'pending'`
  );
  
  let totalClearedKobo = 0;
  let totalPendingKobo = 0;
  for (const tx of pendingCommissions) {
    if (new Date(tx.createdAt) < clearedThreshold) {
      totalClearedKobo += Math.round(parseFloat(tx.amount as unknown as string) * 100);
    } else {
      totalPendingKobo += Math.round(parseFloat(tx.amount as unknown as string) * 100);
    }
  }

  return {
    totalReferrals: partnerReferrals.length,
    activeReferrals: activeCount,
    totalEarnedKobo,
    totalClearedKobo,
    totalPendingKobo
  };
}

export async function settleMatureReferrals() {
  const db = getDb();
  const now = new Date();

  const matureRefs = await db.select()
    .from(referrals)
    .where(
      sql`${referrals.expiresAt} <= ${now} AND ${referrals.status} = 'active' AND ${referrals.commissionEarnedKobo} > 0`
    );

  for (const ref of matureRefs) {
    await db.update(referrals)
      .set({ status: 'expired' })
      .where(eq(referrals.id, ref.id));
  }

  return matureRefs;
}

export async function claimCommissions(partnerPhone: string) {
  const db = getDb();
  const clearedThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  return await db.transaction(async (tx) => {
    // 🛡️ SECURITY: Lock the user's row first to prevent concurrent double-spend race conditions
    await tx.select().from(users).where(eq(users.phone, partnerPhone)).for('update');

    // 1. Find all cleared pending commissions for this partner
    const pendingCommissions = await tx.select().from(transactions).where(
      sql`${transactions.userId} = ${partnerPhone} AND ${transactions.type} = 'commission_pending' AND ${transactions.status} = 'pending' AND ${transactions.createdAt} < ${clearedThreshold}`
    );
    
    if (pendingCommissions.length === 0) {
      return { success: false, message: 'No cleared commissions available to claim.', amountClaimed: 0 };
    }
    
    // 2. Sum them up and mark them as cleared
    let totalToClaimKobo = 0;
    const txIdsToUpdate = [];
    
    for (const commissionTx of pendingCommissions) {
      const amountKobo = Math.round(parseFloat(commissionTx.amount as unknown as string) * 100);
      totalToClaimKobo += amountKobo;
      txIdsToUpdate.push(commissionTx.id);
    }
    
    // Mark old records as cleared
    for (const id of txIdsToUpdate) {
       await tx.update(transactions)
         .set({ status: 'success', type: 'commission_cleared' })
         .where(eq(transactions.id, id));
    }
    
    // 3. Add to Vault Balance
    await tx.update(users)
      .set({ vaultBalanceKobo: sql`${users.vaultBalanceKobo} + ${totalToClaimKobo}` })
      .where(eq(users.phone, partnerPhone));
      
    // 4. Record the sweeping payout transaction
    await tx.insert(transactions).values({
      id: `payout_${crypto.randomUUID()}`,
      userId: partnerPhone,
      type: 'commission_payout',
      amount: (totalToClaimKobo / 100).toFixed(2),
      currency: 'NGN',
      status: 'success',
      reference: `sweep_${crypto.randomUUID()}`
    });
    
    return { success: true, message: `Successfully claimed ${totalToClaimKobo / 100} NGN to vault.`, amountClaimed: totalToClaimKobo };
  });
}


export async function insertBetaFeedback(orgId: string, userPhone: string, content: string) {
  const db = getDb();
  // Ensure we have betaFeedback imported from schema
  const { betaFeedback } = await import('./schema.js');
  
  await db.insert(betaFeedback).values({
    id: `bf_${crypto.randomBytes(8).toString('hex')}`,
    orgId,
    userPhone,
    content: content.substring(0, 500) // Hard truncation
  });
}
