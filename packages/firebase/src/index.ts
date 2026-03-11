import admin from 'firebase-admin';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Config, PaymentConfig } from '@naija-agent/types';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Fix for ESM/CJS interop for firebase-admin
const firebaseAdmin = (admin as any).default || admin;

// Fix for __dirname in ESM/CJS transition
let currentDir: string;
try {
  // @ts-ignore
  currentDir = __dirname;
} catch (e) {
  // If __dirname is not defined, we are in ESM
  const { fileURLToPath } = require('url');
  currentDir = path.dirname(fileURLToPath((import.meta as any).url));
}
const _dirname = currentDir;

// Load .env relative to the source/dist file to support both apps and scripts
const envPaths = [
  path.join(_dirname, '../../.env'),
  path.join(_dirname, '../../../.env'),
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
    projectId: process.env.FIREBASE_PROJECT_ID || 'naija-agent-core',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'naija-agent-core.firebasestorage.app'
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
  config: Config;
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
 * Registers a new merchant's interest in a trial.
 */
export async function registerTrialInterest(data: {
  id: string;
  name: string;
  adminPhone: string;
  botPhone: string;
}): Promise<void> {
  await orgsRef.doc(data.id).set({
    ...data,
    isActive: false,
    status: 'PENDING_PAYMENT',
    deploymentModel: 'SHARED',
    balance: 0,
    currency: 'NGN',
    costPerReply: 3300, // 33.00 NGN (Strategic Odd)
    whatsappPhoneId: 'PENDING', // Will be updated by Sovereign
    config: {
      adminPhone: data.adminPhone,
      botPhone: data.botPhone,
      tools: ['web_search'],
      model: 'gemini-2.5-flash'
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Fetches all organizations currently in the onboarding pipeline.
 */
export async function getPendingSetups(): Promise<any[]> {
  const snapshot = await orgsRef
    .where('status', 'in', ['PENDING_PAYMENT', 'PENDING_META', 'AWAITING_OTP'])
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Updates the status and core ID of a tenant bot.
 */
export async function activateTenant(orgId: string, phoneId: string, accessToken: string): Promise<void> {
  await orgsRef.doc(orgId).update({
    status: 'ACTIVE',
    isActive: true,
    whatsappPhoneId: phoneId,
    'config.whatsappToken': accessToken,
    trialStartedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Updates the onboarding state for an organization.
 */
export async function setOrgOnboarding(orgId: string, step: string, data: any = {}): Promise<void> {
  await orgsRef.doc(orgId).update({
    onboardingStep: step,
    onboardingData: data,
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Fetches the current onboarding state.
 */
export async function getOrgOnboarding(orgId: string): Promise<{ step: string, data: any } | null> {
  const doc = await orgsRef.doc(orgId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  return { 
    step: data?.onboardingStep || 'NONE', 
    data: data?.onboardingData || {} 
  };
}

/**
 * Completes onboarding and promotes temporary data to the final config.
 * Award a 500 NGN starting bonus to remove friction.
 */
export async function completeOnboarding(orgId: string, finalConfig: any): Promise<void> {
  const hashedPin = await bcrypt.hash(finalConfig.adminPin || '1234', 10);
  const bonusKobo = 33300; // 333.00 NGN
  
  await orgsRef.doc(orgId).update({
    name: finalConfig.name,
    onboardingStep: 'COMPLETE',
    onboardingData: null,
    balance: bonusKobo, // Initial gift to see how it works
    'config.adminPin': hashedPin,
    'config.bankDetails': finalConfig.bankDetails,
    'config.systemPrompt': finalConfig.systemPrompt,
    systemPrompt: finalConfig.systemPrompt,
    isActive: true, // Ensure it's active now
    updatedAt: FieldValue.serverTimestamp()
  });

  // Increment network stats to reflect the new user and the gifted kobo
  await incrementNetworkStats({ clientDelta: 1, koboDelta: bonusKobo });
}

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
 * Saves or updates a product in the structured catalog.
 */
export async function saveProduct(orgId: string, id: string, data: { 
  name?: string; 
  price?: number; 
  stock?: number; 
  category?: string; 
  imageUrl?: string;
  lowStockThreshold?: number;
}): Promise<void> {
  const updateData: any = { ...data, updatedAt: FieldValue.serverTimestamp() };
  
  // 🛡️ [PHASE 7.1]: Auto-flag low stock for O(1) indexed querying
  if (data.stock !== undefined) {
    const threshold = data.lowStockThreshold ?? 3;
    updateData.isLowStock = data.stock <= threshold;
  }

  await orgsRef.doc(orgId).collection('products').doc(id).set(updateData, { merge: true });
}

/**
 * Searches for products based on a query string.
 */
export async function searchProducts(orgId: string, query: string, limit = 5): Promise<any[]> {
  const normalizedQuery = query.toLowerCase();
  
  const snapshot = await orgsRef.doc(orgId).collection('products')
    .where('name', '>=', query)
    .where('name', '<=', query + '\uf8ff')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Deletes a product from the catalog.
 */
export async function deleteProduct(orgId: string, productId: string): Promise<void> {
  await orgsRef.doc(orgId).collection('products').doc(productId).delete();
}

/**
 * Atomically decrements stock for a product.
 * Returns the new stock level.
 */
export async function decrementStock(orgId: string, productId: string, quantity: number): Promise<number> {
  const productRef = orgsRef.doc(orgId).collection('products').doc(productId);
  
  return await db.runTransaction(async (t) => {
    const doc = await t.get(productRef);
    if (!doc.exists) throw new Error('PRODUCT_NOT_FOUND');
    
    const data = doc.data();
    const currentStock = data?.stock ?? 0;
    const newStock = Math.max(0, currentStock - quantity);
    
    // Update low stock flag atomically
    const threshold = data?.lowStockThreshold ?? 3;
    
    t.update(productRef, { 
      stock: newStock,
      isLowStock: newStock <= threshold,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    return newStock;
  });
}

/**
 * Fetches products that are below their low-stock threshold.
 * Uses O(1) indexed query (isLowStock flag).
 */
export async function getLowStockItems(orgId: string): Promise<any[]> {
  const snapshot = await orgsRef.doc(orgId).collection('products')
    .where('isLowStock', '==', true)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Authorizes a staff member (Rider, Assistant, etc.) for an organization.
 */
export async function authorizeStaff(orgId: string, phone: string, name: string, role: string): Promise<void> {
  await orgsRef.doc(orgId).collection('staff').doc(phone).set({
    phone,
    name,
    role,
    isActive: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Checks if a phone number is an authorized staff member for an organization.
 */
export async function getStaff(orgId: string, phone: string): Promise<any | null> {
  const doc = await orgsRef.doc(orgId).collection('staff').doc(phone).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Deactivates a staff member.
 */
export async function deactivateStaff(orgId: string, phone: string): Promise<void> {
  await orgsRef.doc(orgId).collection('staff').doc(phone).update({
    isActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Creates or updates a business activity with full State Management.
 */
export async function updateActivity(
  orgId: string, 
  activityId: string, 
  type: string, 
  data: any
): Promise<void> {
  await orgsRef.doc(orgId).collection('activities').doc(activityId).set({
    type,
    status: data.status || 'pending',
    summary: data.summary,
    amount: data.amount || null,
    customerPhone: data.customerPhone || null,
    assignedStaffPhone: data.assignedStaffPhone || null,
    metadata: data.metadata || {},
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Atomically increments or decrements network-wide stats
 */
export async function incrementNetworkStats(data: { koboDelta?: number; clientDelta?: number }): Promise<void> {
  const metaRef = db.collection('network_metadata').doc('global');
  await metaRef.set({
    totalVaultKobo: FieldValue.increment(data.koboDelta || 0),
    activeClients: FieldValue.increment(data.clientDelta || 0),
    updatedAt: FieldValue.serverTimestamp()
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
  const hashedPin = await bcrypt.hash('1234', 10);
  const bridgeSecret = crypto.randomBytes(16).toString('hex'); // 32 chars for SMS bridge auth
  const bonusKobo = 33300; // 333.00 NGN starting bonus

  await orgsRef.doc(data.id).set({
    ...data,
    isActive: true,
    balance: bonusKobo, 
    currency: 'NGN',
    costPerReply: 3300, // 33.00 NGN
    config: {
      tools: ['web_search'],
      model: 'gemini-2.5-flash',
      adminPin: hashedPin,
      bridgeSecret, 
      useSmsBridge: true
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Increment network stats
  await incrementNetworkStats({ clientDelta: 1, koboDelta: bonusKobo });
}

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

  // Clear code after success
  await orgsRef.doc(orgId).update({
    'config.mfaCode': null,
    'config.mfaExpiresAt': null,
    updatedAt: FieldValue.serverTimestamp()
  });

  return true;
}

/**
 * Verifies a tenant's Admin PIN (Salted Hashing)
 */
export async function verifyAdminPin(orgId: string, pin: string): Promise<boolean> {
  const org = await getOrgById(orgId);
  if (!org || !org.config?.adminPin) return false;
  
  return bcrypt.compare(pin, org.config.adminPin);
}

export async function findOrgByAdminPhone(phone: string): Promise<Organization | null> {
  const snapshot = await orgsRef.where('config.adminPhone', '==', phone).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Organization;
}

/**
 * Verifies the Sovereign (Master) PIN for dashboard access
 */
export async function verifySovereignPin(phone: string, pin: string): Promise<boolean> {
  const masterOrg = await getOrgById('naija-agent-master');
  if (!masterOrg) return false;

  // Ensure the phone matches the configured adminPhone for the Master Bot
  if (masterOrg.config.adminPhone !== phone) return false;

  // Direct PIN comparison (Upgraded to Bcrypt)
  return bcrypt.compare(pin, masterOrg.config.adminPin || '');
}

/**
 * Fetches media for a specific organization only.
 */
export async function getOrgMedia(orgId: string, limit = 24): Promise<any[]> {
  const snapshot = await db.collectionGroup('messages')
    .where('type', 'in', ['image', 'audio'])
    .where('orgId', '==', orgId) // Note: Requires a composite index (orgId, type, timestamp)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    chatId: doc.ref.parent.parent?.id,
    ...doc.data()
  }));
}

/**
 * Fetches active conversations for a specific organization only.
 */
export async function getOrgChats(orgId: string, limit = 20): Promise<any[]> {
  const snapshot = await chatsRef
    .where('organizationId', '==', orgId)
    .orderBy('lastMessageAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Fetches high-level stats for a single organization.
 */
export async function getOrgStats(orgId: string): Promise<any> {
  const org = await getOrgById(orgId);
  if (!org) return { balance: 0, chatCount: 0 };

  const chatsSnapshot = await chatsRef.where('organizationId', '==', orgId).count().get();

  return {
    balance: org.balance,
    chatCount: chatsSnapshot.data().count,
    name: org.name,
    bridgeSecret: org.config?.bridgeSecret || 'None'
  };
}
/**
 * Fetches all media (images/audio) across the network using a collection group query
 */
export async function getNetworkMedia(limit = 24): Promise<any[]> {
  const snapshot = await db.collectionGroup('messages')
    .where('type', 'in', ['image', 'audio'])
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    chatId: doc.ref.parent.parent?.id,
    ...doc.data()
  }));
}

/**
 * Fetches all active conversations across the network for the Sovereign
 */
export async function getNetworkChats(limit = 20): Promise<any[]> {
  const snapshot = await chatsRef
    .orderBy('lastMessageAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Aggregates network-wide statistics for the Sovereign (O(1) Optimized)
 */
export async function getNetworkStats(): Promise<any> {
  // 1. Fetch Aggregated Totals (Single Read)
  const metaDoc = await db.collection('network_metadata').doc('global').get();
  const meta = metaDoc.data() || { totalVaultKobo: 0, activeClients: 0 };

  // 2. Fetch Organizations for the list (Still needed for the portfolio table)
  const snapshot = await orgsRef.get();
  const clients: any[] = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (doc.id !== 'naija-agent-master') {
      clients.push({ id: doc.id, name: data.name, balance: data.balance, isActive: data.isActive });
    }
  });

  return {
    activeClients: meta.activeClients,
    totalVaultKobo: meta.totalVaultKobo,
    clients
  };
}

/**
 * Calculates anonymized sales benchmarks for the network.
 */
export async function getNetworkHealthInsight(dateStr: string): Promise<{ avgSalesKobo: number, totalActiveBots: number }> {
  const snapshot = await db.collectionGroup('daily_snapshots')
    .where('updatedAt', '>', Timestamp.fromDate(new Date(Date.now() - 48 * 60 * 60 * 1000))) // Simple heuristic: recent snapshots
    .get();

  let totalSales = 0;
  let count = 0;

  // Manual filter for date because collectionGroup where ID is dateStr is tricky without full path
  snapshot.forEach(doc => {
    if (doc.id === dateStr) {
      totalSales += (doc.data().totalSalesKobo || 0);
      count++;
    }
  });

  return {
    avgSalesKobo: count > 0 ? Math.round(totalSales / count) : 0,
    totalActiveBots: count
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
    status: 'success', // Default for legacy/direct verification
    ...data,
    verifiedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Atomically increments daily sales in the snapshot for the current date.
 */
export async function incrementDailySales(orgId: string, kobo: number): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const snapRef = orgsRef.doc(orgId).collection('daily_snapshots').doc(date);
  
  await snapRef.set({
    totalSalesKobo: FieldValue.increment(kobo),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Fetches the last 7 daily snapshots for an organization.
 */
export async function getWeeklySummary(orgId: string): Promise<any[]> {
  const snapshot = await orgsRef.doc(orgId).collection('daily_snapshots')
    .orderBy('updatedAt', 'desc')
    .limit(7)
    .get();
    
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
 * Atomically books a time slot for a service (Appointment/Booking).
 * Throws an error if the slot is already taken.
 */
export async function bookSlot(
  orgId: string, 
  activityId: string, 
  data: { 
    startTime: string; // ISO String 
    durationMinutes?: number;
    summary: string;
    customerPhone: string;
  }
): Promise<void> {
  const activitiesRef = orgsRef.doc(orgId).collection('activities');
  
  await db.runTransaction(async (t) => {
    // 1. Check for conflicts
    // Note: Ideally, we should use a composite index on startTime, but for now we'll do a basic exact match check.
    // For a robust system, we would query range: start >= req.start && start < req.end.
    // Here we assume "Slots" are fixed start times (e.g. 10:00, 11:00).
    
    const conflictQuery = activitiesRef
      .where('metadata.startTime', '==', data.startTime)
      .where('status', 'in', ['confirmed', 'booked'])
      .limit(1);
      
    const conflictSnap = await t.get(conflictQuery);
    
    if (!conflictSnap.empty) {
      throw new Error('SLOT_TAKEN');
    }

    // 2. Lock the slot
    const newDocRef = activitiesRef.doc(activityId);
    t.set(newDocRef, {
      type: 'booking',
      status: 'confirmed', // Assuming pre-payment or instant booking logic
      summary: data.summary,
      customerPhone: data.customerPhone,
      metadata: {
        startTime: data.startTime,
        duration: data.durationMinutes || 60,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Logs a transaction as pending, awaiting SMS confirmation.
 * Used when AI sees a manual receipt/transfer but can't verify via API.
 */
export async function logPendingTransaction(orgId: string, from: string, amount: number, reference: string): Promise<void> {
  const txId = `${orgId}_${reference}`;
  await db.collection('transactions').doc(txId).set({
    orgId,
    from,
    amount,
    reference,
    status: 'pending',
    verifiedAt: FieldValue.serverTimestamp(), // This is the "Created At" for pending
  });
}

export async function getOrgById(orgId: string): Promise<Organization | null> {
  const doc = await orgsRef.doc(orgId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as Organization;
}

/**
 * Fetches sales and activity summary for a specific date (YYYY-MM-DD).
 */
export async function getOrgDailyStats(orgId: string, dateStr: string): Promise<{ salesKobo: number, pendingActivities: number, newCustomers: number }> {
  const snapRef = orgsRef.doc(orgId).collection('daily_snapshots').doc(dateStr);
  const doc = await snapRef.get();

  const data = doc.exists ? doc.data() : { totalSalesKobo: 0 };

  // Pending activities count
  const pendingSnap = await orgsRef.doc(orgId).collection('activities')
    .where('status', 'in', ['pending', 'confirmed', 'picked_up', 'in_transit'])
    .count()
    .get();

  return {
    salesKobo: data?.totalSalesKobo || 0,
    pendingActivities: pendingSnap.data().count,
    newCustomers: 0 // Placeholder for future implementation
  };
}

/**
 * Fetches active organizations for proactive reporting.
 */

export async function getActiveOrganizations(): Promise<any[]> {
  const snapshot = await orgsRef.where('isActive', '==', true).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

import { formatInTimeZone, toDate } from 'date-fns-tz';

/**
 * Fetches sales and activity summary for a specific date (YYYY-MM-DD).
 */
export async function getUpcomingBookingsForReminders(orgId: string, minInFuture: number, maxInFuture: number): Promise<any[]> {
  const lagosTimeZone = 'Africa/Lagos';
  // 🛡️ [PHASE 5.10]: Force "Now" to be interpreted in Lagos context
  const now = new Date();
  
  const startTime = new Date(now.getTime() + minInFuture * 60000);
  const endTime = new Date(now.getTime() + maxInFuture * 60000);

  const snapshot = await orgsRef.doc(orgId).collection('activities')
    .where('type', '==', 'booking')
    .where('status', '==', 'confirmed')
    .where('metadata.startTime', '>=', startTime.toISOString())
    .where('metadata.startTime', '<=', endTime.toISOString())
    .get();

  // Filter out those that already got a reminder (Firestore index limitation for nulls)
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(b => !b.metadata?.reminderSentAt);
}

export async function cancelBooking(orgId: string, bookingId: string, performedBy = 'system'): Promise<any | null> {
  const docRef = orgsRef.doc(orgId).collection('activities').doc(bookingId);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  await docRef.update({
    status: 'cancelled',
    'metadata.cancelledBy': performedBy,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: doc.id, ...doc.data() };
}

/**
 * Marks a booking as having had a reminder sent.
 */
export async function markReminderSent(orgId: string, activityId: string): Promise<void> {
  await orgsRef.doc(orgId).collection('activities').doc(activityId).update({
    'metadata.reminderSentAt': FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Logs a system-level event for the Audit Trail (Phase 5.12)
 */
export async function logSystemEvent(orgId: string, eventType: string, summary: string, metadata: any = {}): Promise<void> {
  await db.collection('organizations').doc(orgId).collection('system_logs').add({
    eventType,
    summary,
    metadata,
    timestamp: FieldValue.serverTimestamp()
  });
}

/**
 * Confirms a pending transaction and links it to an SMS alert
 */
export async function confirmTransaction(txId: string, smsId: string): Promise<void> {
  await db.collection('transactions').doc(txId).update({
    status: 'success',
    smsId,
    confirmedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Securely tops up a tenant's balance.
 * Requires a unique reference to prevent double-crediting.
 */
export async function topupTenant(
  orgId: string, 
  amountNaira: number, 
  reference: string
): Promise<{ newBalance: number } | null> {
  const amountKobo = Math.round(amountNaira * 100);
  const txRef = `topup_${reference}`;
  
  try {
    const result = await db.runTransaction(async (t) => {
      // 1. Idempotency Check: Has this reference been used?
      const refDoc = await t.get(db.collection('topup_references').doc(txRef));
      if (refDoc.exists) {
        throw new Error('DUPLICATE_REFERENCE');
      }

      // 2. Fetch Tenant
      const orgRef = orgsRef.doc(orgId);
      const orgDoc = await t.get(orgRef);
      if (!orgDoc.exists) throw new Error('TENANT_NOT_FOUND');

      const currentBalance = orgDoc.data()?.balance || 0;
      const newBalance = currentBalance + amountKobo;

      // 3. Update Balance and Burn Reference
      t.update(orgRef, { 
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp()
      });
      t.set(db.collection('topup_references').doc(txRef), {
        orgId,
        amountNaira,
        usedAt: FieldValue.serverTimestamp()
      });

      return { newBalance };
    });

    // 4. Update Global Network Stats (Kobo)
    await incrementNetworkStats({ koboDelta: amountKobo });

    return result;
  } catch (e: any) {
    console.warn(`❌ Top-up failed for ${orgId}:`, e.message);
    if (e.message === 'DUPLICATE_REFERENCE') throw e;
    return null;
  }
}

export async function addBalance(orgId: string, amount: number): Promise<number | null> {
  const orgRef = orgsRef.doc(orgId);
  let newBalance: number | null = null;

  try {
    await db.runTransaction(async (t: any) => {
      const doc = await t.get(orgRef);
      if (!doc.exists) throw new Error('Org not found');

      const data = doc.data() as Organization;
      const currentBalance = data.balance || 0;

      newBalance = currentBalance + amount;
      t.update(orgRef, { balance: newBalance });
    });

    // Update global vault total
    await incrementNetworkStats({ koboDelta: amount });
    
    return newBalance;
  } catch (e) {
    console.warn(`Balance addition failed for ${orgId}:`, e);
    return null;
  }
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

    // Update global vault total (Decrement)
    await incrementNetworkStats({ koboDelta: -amount });

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

/**
 * Adds a phone number to the global fraud registry.
 */
export async function reportFraud(phone: string, reason: string): Promise<void> {
  await db.collection('global_fraud_registry').doc(phone).set({
    phone,
    reason,
    reportedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Checks if a phone number is in the global fraud registry.
 */
export async function checkFraud(phone: string): Promise<{ phone: string, reason: string } | null> {
  const doc = await db.collection('global_fraud_registry').doc(phone).get();
  return doc.exists ? doc.data() as any : null;
}

/**
 * Atomically adds an item to a user's cart after checking stock levels.
 */
/**
 * Finds carts updated between 30 and 120 minutes ago that haven't been nudged.
 * Uses O(1) indexed query (isCartActive flag).
 */
export async function getAbandonedCarts(maxAgeMinutes: number = 120, minAgeMinutes: number = 30) {
  const now = Date.now();
  const minAge = new Date(now - minAgeMinutes * 60 * 1000);
  const maxAge = new Date(now - maxAgeMinutes * 60 * 1000);

  // 🛡️ [PHASE 7.1]: Optimized indexed query instead of full scan
  const snapshot = await chatsRef
    .where('isCartActive', '==', true)
    .where('lastCartUpdateAt', '<=', Timestamp.fromDate(minAge))
    .where('lastCartUpdateAt', '>=', Timestamp.fromDate(maxAge))
    .get();

  const abandoned: any[] = [];

  for (const chatDoc of snapshot.docs) {
    const chatData = chatDoc.data();
    
    // Check if we already nudged this specific session
    if (chatData.lastNudgeAt) {
       const lastNudge = (chatData.lastNudgeAt as Timestamp).toDate().getTime();
       if (now - lastNudge < 12 * 60 * 60 * 1000) continue; // Only nudge once every 12 hours
    }

    const orgId = chatData.organizationId;
    const userPhone = chatData.whatsappUserId;
    abandoned.push({ orgId, userPhone, chatId: chatDoc.id });
  }
  return abandoned;
}

/**
 * Marks a chat as nudged to prevent spamming the customer.
 */
export async function markCartNudged(chatId: string) {
  await chatsRef.doc(chatId).update({
    lastNudgeAt: FieldValue.serverTimestamp()
  });
}

export async function addToCart(
  orgId: string, 
  userPhone: string, 
  productId: string, 
  quantity: number
): Promise<{ success: boolean; message: string }> {
  const productRef = orgsRef.doc(orgId).collection('products').doc(productId);
  const chatId = `${orgId}_${userPhone}`;
  const cartItemRef = chatsRef.doc(chatId).collection('cart').doc(productId);

  try {
    return await db.runTransaction(async (t) => {
      const productDoc = await t.get(productRef);
      if (!productDoc.exists) return { success: false, message: 'PRODUCT_NOT_FOUND' };
      
      const productData = productDoc.data();
      const currentStock = productData?.stock ?? 9999; 

      if (currentStock < quantity) {
        return { success: false, message: `INSUFFICIENT_STOCK: Only ${currentStock} left.` };
      }

      const cartDoc = await t.get(cartItemRef);
      const currentCartQty = cartDoc.exists ? cartDoc.data()?.quantity || 0 : 0;

      t.set(cartItemRef, {
        productId,
        name: productData?.name,
        price: productData?.price, 
        quantity: currentCartQty + quantity,
        addedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      // 🛡️ [PHASE 7.1]: Set indexed flag on parent chat for abandonment tracking
      t.update(chatsRef.doc(chatId), {
        isCartActive: true,
        lastCartUpdateAt: FieldValue.serverTimestamp()
      });

      return { success: true, message: 'ADDED' };
    });
  } catch (e: any) {
    console.error('Add to Cart Error:', e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Atomically removes an item (or reduces quantity) from a user's cart.
 */
export async function removeFromCart(
  orgId: string, 
  userPhone: string, 
  productId: string, 
  quantity?: number // If null, remove the whole item
): Promise<{ success: boolean; message: string }> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  const cartItemRef = chatRef.collection('cart').doc(productId);

  try {
    return await db.runTransaction(async (t) => {
      const cartDoc = await t.get(cartItemRef);
      if (!cartDoc.exists) return { success: false, message: 'ITEM_NOT_IN_CART' };

      const currentQty = cartDoc.data()?.quantity || 0;

      if (!quantity || currentQty <= quantity) {
        t.delete(cartItemRef);
        
        // Check if cart is now empty to clear flag
        const remainingItems = await t.get(chatRef.collection('cart').limit(1));
        if (remainingItems.empty) {
          t.update(chatRef, { isCartActive: false });
        }

        return { success: true, message: 'REMOVED_ENTIRELY' };
      } else {
        t.update(cartItemRef, { 
          quantity: currentQty - quantity,
          updatedAt: FieldValue.serverTimestamp()
        });
        t.update(chatRef, { lastCartUpdateAt: FieldValue.serverTimestamp() });
        return { success: true, message: 'QUANTITY_REDUCED' };
      }
    });
  } catch (e: any) {
    console.error('Remove from Cart Error:', e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Fetches all items in a user's cart and calculates the total.
 */
export async function getCart(orgId: string, userPhone: string): Promise<{ items: any[], totalKobo: number }> {
  const cartSnapshot = await chatsRef.doc(`${orgId}_${userPhone}`).collection('cart').get();
  
  let totalKobo = 0;
  const items: any[] = [];

  cartSnapshot.forEach(doc => {
    const data = doc.data();
    const itemTotal = (data.price || 0) * (data.quantity || 0) * 100; // Convert to Kobo
    totalKobo += itemTotal;
    items.push({ id: doc.id, ...data });
  });

  return { items, totalKobo };
}

/**
 * Clears the user's cart session.
 */
export async function clearCart(orgId: string, userPhone: string): Promise<void> {
  const chatId = `${orgId}_${userPhone}`;
  const chatRef = chatsRef.doc(chatId);
  const cartRef = chatRef.collection('cart');
  const snapshot = await cartRef.get();
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  // Clear indexed flag
  batch.update(chatRef, { isCartActive: false, lastCartUpdateAt: FieldValue.serverTimestamp() });
  
  await batch.commit();
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
      isCartActive: false, // Default
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  
  return chatId;
}
