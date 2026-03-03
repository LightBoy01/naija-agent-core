import * as admin from 'firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '../../.env' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  let credential;
  const localKeyPath = path.join(__dirname, '/../serviceAccountKey.json');

  if (fs.existsSync(localKeyPath)) {
    // 1. Try local file (Termux)
    credential = admin.credential.cert(localKeyPath);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // 2. Try Environment Variable (Cloud / Railway)
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.replace(/[^\x20-\x7E]/g, ''));
      credential = admin.credential.cert(serviceAccount);
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT ENV', e);
      process.exit(1);
    }
  } else {
    console.error('❌ Firebase Error: No serviceAccountKey.json found and FIREBASE_SERVICE_ACCOUNT ENV is missing.');
    process.exit(1);
  }

  admin.initializeApp({
    credential,
    projectId: 'naija-agent-core'
  });
}

const db = getFirestore();

// --- Collections ---
const orgsRef = db.collection('organizations');
const chatsRef = db.collection('chats');

// --- Types ---
export interface Organization {
  id: string;
  name: string;
  whatsappPhoneId: string;
  systemPrompt: string;
  config: { tools: string[] };
  isActive: boolean;
  balance: number; // In Kobo
  currency: string;
  costPerReply: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'audio' | 'image';
  timestamp: Timestamp;
  metadata?: any;
}

// --- Helpers ---

export const getDb = () => db;

export async function getOrgByPhoneId(phoneId: string): Promise<Organization | null> {
  const snapshot = await orgsRef.where('whatsappPhoneId', '==', phoneId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Organization;
}

export async function getOrgById(orgId: string): Promise<Organization | null> {
  const doc = await orgsRef.doc(orgId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Organization;
}

export async function deductBalance(orgId: string, amount: number): Promise<boolean> {
  const orgRef = orgsRef.doc(orgId);
  
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(orgRef);
      if (!doc.exists) throw new Error('Org not found');
      
      const data = doc.data() as Organization;
      const newBalance = (data.balance || 0) - amount;
      
      if (newBalance < 0) {
        throw new Error('Insufficient balance');
      }
      
      t.update(orgRef, { balance: newBalance });
    });
    return true;
  } catch (e) {
    console.warn(`Balance deduction failed for ${orgId}:`, e);
    return false;
  }
}

export async function saveMessage(chatId: string, message: Omit<Message, 'timestamp'>) {
  const chatRef = chatsRef.doc(chatId);
  // Add to subcollection 'messages'
  await chatRef.collection('messages').add({
    ...message,
    timestamp: FieldValue.serverTimestamp(),
  });
  
  // Update last activity on parent chat doc
  await chatRef.set({
    lastMessageAt: FieldValue.serverTimestamp(),
    summary: message.content.substring(0, 50) + '...', // Simple preview
  }, { merge: true });
}

export async function getChatHistory(chatId: string, limit = 10): Promise<Message[]> {
  const snapshot = await chatsRef.doc(chatId).collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
    
  return snapshot.docs.map(doc => doc.data() as Message).reverse();
}

export async function findOrCreateChat(orgId: string, userPhone: string, userName: string): Promise<string> {
  // Composite Key strategy: orgId_userPhone
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  
  const doc = await chatRef.get();
  if (!doc.exists) {
    await chatRef.set({
      organizationId: orgId,
      whatsappUserId: userPhone,
      userName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  
  return chatId;
}
