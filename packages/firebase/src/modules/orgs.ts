import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { Organization } from '@naija-agent/types';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * High-security lookup for the SMS Bridge (Phase 5.8)
 */
export async function getOrgByBridgeSecret(secret: string): Promise<any | null> {
  const snapshot = await orgsRef.where('config.bridgeSecret', '==', secret).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Sets a temporary 6-digit MFA code for an organization
 */
export async function setMfaCode(orgId: string, code: string, expiryMinutes = 5): Promise<void> {
  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
  await orgsRef.doc(orgId).update({
    'config.mfaCode': code,
    'config.mfaExpiresAt': expiry.toISOString(),
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Verifies an MFA code and clears it if successful
 */
export async function verifyMfaCode(orgId: string, code: string): Promise<boolean> {
  const org = await getOrgById(orgId);
  if (!org || !org.config?.mfaCode || !org.config?.mfaExpiresAt) return false;

  const now = new Date();
  const expiry = new Date(org.config.mfaExpiresAt);

  if (now > expiry) return false;
  if (org.config.mfaCode !== code) return false;

  await orgsRef.doc(orgId).update({
    'config.mfaCode': null,
    'config.mfaExpiresAt': null,
    updatedAt: FieldValue.serverTimestamp()
  });

  return true;
}

export async function findOrgByAdminPhone(phone: string): Promise<Organization | null> {
  const snapshot = await orgsRef.where('config.adminPhone', '==', phone).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Organization;
}

export async function getOrgByPhoneId(phoneId: string): Promise<Organization | null> {
  const snapshot = await orgsRef.where('whatsappPhoneId', '==', phoneId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Organization;
}

/**
 * Toggles the active status of an organization (Global Start/Stop).
 */
export async function setOrgActive(orgId: string, status: boolean): Promise<void> {
  await orgsRef.doc(orgId).update({
    isActive: status,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Instantly suspends an organization (Phase 9.3 Hardening).
 */
export async function suspendOrganization(orgId: string, reason: string): Promise<void> {
  await orgsRef.doc(orgId).update({
    isActive: false,
    status: 'SUSPENDED',
    'config.suspensionReason': reason,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Unsuspends an organization.
 */
export async function unsuspendOrganization(orgId: string): Promise<void> {
  await orgsRef.doc(orgId).update({
    isActive: true,
    status: 'ACTIVE',
    'config.suspensionReason': null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Fetches high-level stats for a single organization.
 */
export async function getOrgStats(orgId: string): Promise<any> {
  const org = await getOrgById(orgId);
  if (!org) return { balance: 0, chatCount: 0 };

  const chatsRef = db.collection('chats');
  const chatsSnapshot = await chatsRef.where('organizationId', '==', orgId).count().get();

  return {
    balance: org.balance,
    chatCount: chatsSnapshot.data().count,
    name: org.name,
    bridgeSecret: org.config?.bridgeSecret || 'None'
  };
}

export async function getOrgById(orgId: string): Promise<Organization | null> {
  const doc = await orgsRef.doc(orgId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Organization;
}

/**
 * Fetches active organizations for proactive reporting.
 */
export async function getActiveOrganizations(): Promise<any[]> {
  const snapshot = await orgsRef.where('isActive', '==', true).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
