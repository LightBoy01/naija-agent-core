import admin from 'firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Config, PaymentConfig } from '@naija-agent/types';

// Fix for ESM/CJS interop for firebase-admin
const firebaseAdmin = (admin as any).default || admin;

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env relative to the source/dist file to support both apps and scripts
// src/index.ts -> ../../.env
// dist/index.js -> ../../../.env (if built)
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '../../../.env'),
  path.join(process.cwd(), '.env')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// DIAGNOSTIC: Log detected environment keys (Safe: no values logged)
const detectedKeys = Object.keys(process.env).filter(k => 
  k.startsWith('FIREBASE_') || k.startsWith('WHATSAPP_') || k.startsWith('GEMINI_') || k.startsWith('ADMIN_')
);
console.log('🔍 [DIAGNOSTIC] Detected ENV Keys:', detectedKeys.join(', '));

// Initialize Firebase Admin
if (!firebaseAdmin.apps.length) {
  let credential;
  // Look for serviceAccountKey.json relative to this file
  const localKeyPath = path.join(__dirname, '../serviceAccountKey.json');
  const localKeyPathDist = path.join(__dirname, '../../serviceAccountKey.json');

  if (fs.existsSync(localKeyPath)) {
    credential = firebaseAdmin.credential.cert(localKeyPath);
  } else if (fs.existsSync(localKeyPathDist)) {
    credential = firebaseAdmin.credential.cert(localKeyPathDist);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      // Robust JSON parsing for multiline env vars
      const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const serviceAccount = JSON.parse(serviceAccountStr);
      credential = firebaseAdmin.credential.cert(serviceAccount);
    } catch (e) {
      console.error('❌ Firebase Error: Failed to parse FIREBASE_SERVICE_ACCOUNT ENV', e);
      process.exit(1);
    }
  } else {
    console.error('❌ Firebase Error: No serviceAccountKey.json found and FIREBASE_SERVICE_ACCOUNT ENV is missing.');
    process.exit(1);
  }

  firebaseAdmin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core'
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
  config: { 
    tools: string[];
    payment?: PaymentConfig;
    model?: string;
    adminPhone?: string;
    adminPin?: string;
    isMaster?: boolean;
  };
  isActive: boolean;
  balance: number; // In Kobo
  currency: string;
  costPerReply: number;
  costPerImage?: number;
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

/**
 * Saves a piece of business knowledge (Price, Policy, Fact)
 */
export async function saveKnowledge(orgId: string, key: string, content: string, imageUrl?: string): Promise<void> {
  const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '_');
  await orgsRef.doc(orgId).collection('knowledge').doc(slug).set({
    key,
    content,
    imageUrl: imageUrl || null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Fetches all knowledge for an organization
 */
export async function getAllKnowledge(orgId: string): Promise<Record<string, string>> {
  const snapshot = await orgsRef.doc(orgId).collection('knowledge').get();
  const knowledge: Record<string, string> = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    knowledge[data.key] = data.content;
  });
  return knowledge;
}

/**
 * Deletes a specific piece of knowledge
 */
export async function deleteKnowledge(orgId: string, key: string): Promise<void> {
  const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '_');
  await orgsRef.doc(orgId).collection('knowledge').doc(slug).delete();
}

/**
 * Creates or updates a business activity (Booking, Delivery, Order)
 */
export async function updateActivity(
  orgId: string, 
  activityId: string, 
  type: 'booking' | 'delivery' | 'order', 
  data: any
): Promise<void> {
  await orgsRef.doc(orgId).collection('activities').doc(activityId).set({
    type,
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Spawns a new tenant organization (Onboarding)
 */
export async function createTenant(data: {
  id: string;
  name: string;
  whatsappPhoneId: string;
  adminPhone: string;
  systemPrompt: string;
}): Promise<void> {
  await orgsRef.doc(data.id).set({
    ...data,
    isActive: true,
    balance: 100000, // Starting bonus: 1000.00 NGN
    currency: 'NGN',
    costPerReply: 2000,
    config: {
      tools: ['web_search'],
      model: 'gemini-2.5-flash',
      adminPin: '1234'
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Aggregates network-wide statistics for the Sovereign
 */
export async function getNetworkStats(): Promise<any> {
  const snapshot = await orgsRef.get();
  let totalBalance = 0;
  let activeClients = 0;
  const clients: any[] = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (doc.id !== 'naija-agent-master') {
      totalBalance += data.balance || 0;
      activeClients++;
      clients.push({ id: doc.id, name: data.name, balance: data.balance });
    }
  });

  return {
    activeClients,
    totalVaultKobo: totalBalance,
    clients
  };
}

export async function verifyAdminSession(orgId: string, adminPhone: string): Promise<boolean> {
  const chatId = `${orgId}_${adminPhone}`;
  const chatDoc = await chatsRef.doc(chatId).get();
  if (!chatDoc.exists) return false;
  
  const lastAuth = chatDoc.data()?.lastAdminAuthAt;
  if (!lastAuth) return false;

  // Session expires in 2 hours (7200000 ms)
  const isExpired = (Date.now() - lastAuth.toDate().getTime()) > 7200000;
  return !isExpired;
}

export async function setAdminAuth(orgId: string, adminPhone: string): Promise<void> {
  const chatId = `${orgId}_${adminPhone}`;
  await chatsRef.doc(chatId).set({
    lastAdminAuthAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

export async function setOptOut(orgId: string, userPhone: string, status: boolean): Promise<void> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  await chatRef.set({ isOptedOut: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function checkOptOut(orgId: string, userPhone: string): Promise<boolean> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  const doc = await chatRef.get();
  return doc.exists ? (doc.data()?.isOptedOut || false) : false;
}

export async function getOrgByPhoneId(phoneId: string): Promise<Organization | null> {
  const snapshot = await orgsRef.where('whatsappPhoneId', '==', phoneId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Organization;
}

// --- Transaction Helpers (Replay Protection) ---

export async function checkTransaction(orgId: string, reference: string): Promise<any | null> {
  const txId = `${orgId}_${reference}`;
  const doc = await db.collection('transactions').doc(txId).get();
  return doc.exists ? doc.data() : null;
}

export async function logTransaction(orgId: string, reference: string, data: any): Promise<void> {
  const txId = `${orgId}_${reference}`;
  await db.collection('transactions').doc(txId).set({
    orgId,
    reference,
    ...data,
    verifiedAt: FieldValue.serverTimestamp(),
  });
}

export async function getOrgById(orgId: string): Promise<Organization | null> {
  const doc = await orgsRef.doc(orgId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Organization;
}

export async function deductBalance(orgId: string, amount: number): Promise<number | null> {
  const orgRef = orgsRef.doc(orgId);
  let newBalance: number | null = null;
  
  try {
    await db.runTransaction(async (t: any) => { // Use 'any' to bypass strict TS check for now if needed, or proper Transaction type
      const doc = await t.get(orgRef);
      if (!doc.exists) throw new Error('Org not found');
      
      const data = doc.data() as Organization;
      const currentBalance = data.balance || 0;

      if (currentBalance < amount) {
        throw new Error(`Insufficient balance: ${currentBalance} < ${amount}`);
      }
      
      newBalance = currentBalance - amount;
      t.update(orgRef, { balance: newBalance });
    });
    return newBalance;
  } catch (e) {
    console.warn(`Balance deduction failed for ${orgId}:`, e);
    return null;
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
      isOptedOut: false, // Default
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  
  return chatId;
}
