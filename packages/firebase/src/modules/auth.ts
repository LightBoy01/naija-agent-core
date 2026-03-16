import { 
  getFirestore, 
  FieldValue 
} from 'firebase-admin/firestore';
import { getOrgById } from './orgs.js';
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

  if (masterOrg.config.adminPhone !== phone) return false;

  return bcrypt.compare(pin, masterOrg.config.adminPin || '');
}
