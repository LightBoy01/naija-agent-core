import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { incrementNetworkStats } from './stats.js';
import { setAdminAuth } from './auth.js';
import { Organization, OnboardingData, OnboardingConfig, parseAndFormatPhone } from '@naija-agent/types';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * Registers a new merchant's interest in a trial and unlocks immediate demo access.
 */
export async function registerTrialInterest(data: {
  id: string;
  name: string;
  adminPhone: string;
  botPhone: string;
  timezone?: string;
}): Promise<void> {
  const trialBonus = 100000; // 1,000.00 NGN Trial Gift
  const timezone = data.timezone || 'Africa/Lagos';
  const adminPhone = parseAndFormatPhone(data.adminPhone) || data.adminPhone;
  const botPhone = parseAndFormatPhone(data.botPhone) || data.botPhone;
  
  await orgsRef.doc(data.id).set({
    ...data,
    adminPhone,
    botPhone,
    timezone,
    isActive: true, // UNLOCKED: Trial starts immediately
    status: 'TRIAL',
    deploymentModel: 'SHARED',
    balance: trialBonus,
    currency: 'NGN',
    costPerReply: 3300, 
    whatsappPhoneId: 'PENDING', 
    config: {
      adminPhone,
      botPhone,
      tools: ['web_search'],
      model: 'deepseek-v4-flash'
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await incrementNetworkStats({ clientDelta: 1, koboDelta: trialBonus });
}

/**
 * Fetches all organizations currently in the onboarding pipeline.
 */
export async function getPendingSetups(): Promise<Organization[]> {
  const snapshot = await orgsRef
    .where('status', 'in', ['PENDING_PAYMENT', 'PENDING_META', 'AWAITING_OTP'])
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Organization));
}

/**
 * Updates the status and core ID of a tenant bot using a transaction.
 * Ensures data integrity during the Meta activation relay.
 */
export async function activateTenant(orgId: string, phoneId: string, accessToken: string): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const docRef = orgsRef.doc(orgId);
    const doc = await transaction.get(docRef);
    
    if (!doc.exists) throw new Error(`Organization ${orgId} not found`);

    transaction.update(docRef, {
      status: 'ACTIVE',
      isActive: true,
      whatsappPhoneId: phoneId,
      'config.whatsappToken': accessToken,
      pendingSetup: null, // Clear relay data on success
      trialStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
}

/**
 * Updates the onboarding state for an organization.
 */
export async function setOrgOnboarding(orgId: string, step: string, data: OnboardingData = {}): Promise<void> {
  await orgsRef.doc(orgId).update({
    onboardingStep: step,
    onboardingData: data,
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Fetches the current onboarding state.
 */
export async function getOrgOnboarding(orgId: string): Promise<OnboardingConfig | null> {
  const doc = await orgsRef.doc(orgId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return { 
    step: (data?.onboardingStep || 'NONE') as OnboardingConfig['step'], 
    data: data?.onboardingData || {} 
  };
}

/**
 * Completes onboarding and promotes temporary data to the final config.
 * Uses a transaction to ensure stat consistency and atomic deployment.
 *
 * NOTE: This does NOT grant the ₦1,000 bonus — that's applied once during
 * initial tenant creation (createTenant / registerTrialInterest). Re-running
 * setup must not overwrite the existing balance.
 */
export async function completeOnboarding(orgId: string, finalConfig: OnboardingData): Promise<void> {
  // 🛡️ [SECURITY]: Hash the PIN *before* the transaction to keep it lean
  let hashedPin = finalConfig.adminPin;
  if (!hashedPin) throw new Error('Security Error: Admin PIN is mandatory for onboarding completion');

  const isBcrypt = /^\$2[aby]\$.{56}$/.test(hashedPin);
  if (!isBcrypt) {
    hashedPin = await bcrypt.hash(hashedPin, 10);
  }

  const adminPhone = await db.runTransaction(async (transaction) => {
    const orgRef = orgsRef.doc(orgId);
    const doc = await transaction.get(orgRef);

    if (!doc.exists) throw new Error(`Organization ${orgId} not found`);

    transaction.update(orgRef, {
      name: finalConfig.name,
      onboardingStep: 'COMPLETE',
      onboardingData: null, // 🔥 CLEAR PII
      timezone: finalConfig.timezone || 'Africa/Lagos',
      'config.adminPin': hashedPin,
      'config.bankDetails': {
        bankName: finalConfig.bankName,
        accountNumber: finalConfig.accountNumber,
        accountName: finalConfig.accountName
      },
      'config.systemPrompt': finalConfig.systemPrompt,
      systemPrompt: finalConfig.systemPrompt,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp()
    });

    return doc.data()?.config?.adminPhone;
  });

  // 🛡️ [UX]: Auto-authenticate the Boss (Post-Transaction)
  if (adminPhone) {
    await setAdminAuth(orgId, adminPhone);
  }
}

/**
 * Completes onboarding from the hybrid web flow.
 *
 * NOTE: This does NOT grant the ₦1,000 bonus — 'createTenant' handles that.
 * Re-running setup must not overwrite the existing balance.
 */
export async function completeHybridOnboarding(orgId: string, data: OnboardingData & { meta: { accessToken: string, phoneId: string, wabaId?: string } }): Promise<void> {
  let hashedPin = data.adminPin;
  if (!hashedPin) throw new Error('Security Error: Admin PIN is mandatory for hybrid onboarding');

  const isBcrypt = /^\$2[aby]\$.{56}$/.test(hashedPin);
  if (!isBcrypt) {
    hashedPin = await bcrypt.hash(hashedPin, 10);
  }

  const adminPhone = await db.runTransaction(async (transaction) => {
    const orgRef = orgsRef.doc(orgId);
    const doc = await transaction.get(orgRef);

    if (!doc.exists) throw new Error(`Organization ${orgId} not found`);

    transaction.update(orgRef, {
      name: data.name,
      onboardingStep: 'COMPLETE',
      onboardingData: null,
      status: 'ACTIVE',
      isActive: true,
      whatsappPhoneId: data.meta.phoneId,
      'config.whatsappToken': data.meta.accessToken,
      'config.wabaId': data.meta.wabaId,
      'config.adminPin': hashedPin,
      'config.bankDetails': {
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountName: data.accountName
      },
      updatedAt: FieldValue.serverTimestamp()
    });

    return doc.data()?.config?.adminPhone;
  });

  // 🛡️ [UX]: Auto-authenticate the Boss (Post-Transaction)
  if (adminPhone) {
    await setAdminAuth(orgId, adminPhone);
  }
}
export async function createTenant(data: {
  id: string;
  name: string;
  whatsappPhoneId: string;
  adminPhone: string;
  adminPin: string;
  systemPrompt: string;
  timezone?: string;
}): Promise<void> {
  const hashedPin = await bcrypt.hash(data.adminPin, 10);
  const bridgeSecret = crypto.randomBytes(16).toString('hex'); 
  const bonusKobo = 100000;
  const timezone = data.timezone || 'Africa/Lagos';
  const adminPhone = parseAndFormatPhone(data.adminPhone) || data.adminPhone;

  await orgsRef.doc(data.id).set({
    ...data,
    adminPhone,
    timezone,
    isActive: true,
    status: 'ACTIVE',
    balance: bonusKobo, 
    currency: 'NGN',
    costPerReply: 3300, 
    config: {
      tools: ['web_search'],
      model: 'deepseek-v4-flash',
      adminPin: hashedPin,
      bridgeSecret, 
      useSmsBridge: true
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await incrementNetworkStats({ clientDelta: 1, koboDelta: bonusKobo });
}
