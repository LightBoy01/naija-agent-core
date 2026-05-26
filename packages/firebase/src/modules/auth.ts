import { 
  getFirestore, 
  FieldValue 
} from 'firebase-admin/firestore';
import { getOrgById } from './orgs.js';
import { parseAndFormatPhone } from '@naija-agent/types';
import bcrypt from 'bcrypt';

const db = getFirestore();
const chatsRef = db.collection('chats');

export async function verifyAdminSession(orgId: string, adminPhone: string): Promise<boolean> {
  const chatId = `${orgId}_${adminPhone}`;
  const chatDoc = await chatsRef.doc(chatId).get();
  if (!chatDoc.exists) return false;
  
  const lastAuth = chatDoc.data()?.lastAdminAuthAt;
  if (!lastAuth) return false;

  const isExpired = (Date.now() - lastAuth.toDate().getTime()) > 7200000;
  return !isExpired;
}

export async function setAdminAuth(orgId: string, adminPhone: string): Promise<void> {
  const chatId = `${orgId}_${adminPhone}`;
  await chatsRef.doc(chatId).set({
    lastAdminAuthAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

export async function verifyAdminPin(orgId: string, pin: string): Promise<boolean> {
  const org = await getOrgById(orgId);
  if (!org || !org.config?.adminPin) return false;
  
  return bcrypt.compare(pin, org.config.adminPin);
}

export async function verifySovereignPin(phone: string, pin: string): Promise<boolean> {
  const masterOrg = await getOrgById('naija-agent-master');
  if (!masterOrg || !masterOrg.config) return false;

  const phoneNormalized = parseAndFormatPhone(phone) || phone;
  const masterAdminPhoneNormalized = parseAndFormatPhone(masterOrg.config.adminPhone || '') || masterOrg.config.adminPhone;

  if (masterAdminPhoneNormalized !== phoneNormalized) return false;

  return bcrypt.compare(pin, masterOrg.config.adminPin || '');
}

export async function setUserPin(phone: string, pin: string): Promise<void> {
    const hashedPin = await bcrypt.hash(pin, 10);
    // 1. Update NoSQL (Legacy)
    await db.collection('user_profiles').doc(phone).set({
        pin: hashedPin
    }, { merge: true });

    // 2. Update SQL (Sovereign Truth)
    const { getDb, users } = await import('@naija-agent/database');
    const { sql } = await import('drizzle-orm');
    await getDb().update(users)
        .set({ pinHash: hashedPin, updatedAt: new Date() })
        .where(sql`${users.phone} = ${phone}` as any);
}

export async function verifyUserPin(phone: string, pin: string): Promise<boolean> {
    // 1. Try NoSQL
    const userDoc = await db.collection('user_profiles').doc(phone).get();
    let hash = userDoc.exists ? userDoc.data()?.pin : null;

    // 2. Fallback to SQL if NoSQL missing
    if (!hash) {
        const { getDb, users } = await import('@naija-agent/database');
        const { sql } = await import('drizzle-orm');
        const sqlResult = await getDb().select({ hash: users.pinHash }).from(users).where(sql`${users.phone} = ${phone}` as any).limit(1);
        hash = sqlResult[0]?.hash;
    }

    if (!hash) return false;
    return bcrypt.compare(pin, hash);
}
