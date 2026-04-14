import { 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { db } from '../db.js';

const orgsRef = db.collection('organizations');

/**
 * Atomically increments network-wide stats
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
 * Aggregates network-wide statistics for the Sovereign (O(1) Optimized)
 */
export async function getNetworkStats(orgId: string): Promise<any> {
  if (orgId !== 'naija-agent-master') {
    throw new Error('UNAUTHORIZED_VAULT_QUERY');
  }

  // 1. Fetch Aggregated Totals (Single Read)
  const metaDoc = await db.collection('network_metadata').doc('global').get();
  const meta = metaDoc.data() || { totalVaultKobo: 0, activeClients: 0 };

  // 2. Fetch Organizations for the list (Still needed for the portfolio table)
  const snapshot = await orgsRef.get();
  const clients: any[] = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (doc.id !== 'naija-agent-master') {
      clients.push({
        id: doc.id,
        name: data.name,
        balance: data.balance,
        isActive: data.isActive,
        status: data.status || 'ACTIVE',
        botPhone: data.config?.botPhone || 'N/A'
      });
    }
  });

  // 3. Fetch Life OS Users (Aelixxr users)
  const lifeUsersSnapshot = await db.collection('user_profiles').get();
  const lifeUsers: any[] = [];
  lifeUsersSnapshot.forEach(doc => {
    const data = doc.data();
    lifeUsers.push({
      id: doc.id,
      name: data.fullName || 'Life OS User',
      energyCredits: data.energyCredits || 0,
      lastInteraction: data.lastInteraction ? data.lastInteraction.toDate().toISOString() : null,
      isActive: true,
      status: 'ACTIVE'
    });
  });

  return {
    activeClients: meta.activeClients,
    totalVaultKobo: meta.totalVaultKobo,
    clients,
    lifeUsers
  };}

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
 * Atomically increments daily expenses (bot usage costs) in the snapshot for the current date.
 */
export async function incrementDailyExpenses(orgId: string, kobo: number): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const snapRef = orgsRef.doc(orgId).collection('daily_snapshots').doc(date);
  
  await snapRef.set({
    totalExpensesKobo: FieldValue.increment(kobo),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Fetches the last N daily snapshots for an organization.
 */
export async function getWeeklySummary(orgId: string, limit = 7): Promise<any[]> {
  const snapshot = await orgsRef.doc(orgId).collection('daily_snapshots')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
    
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
}

/**
 * Logs a system-level event for the Audit Trail (Phase 5.12)
 */
export async function logSystemEvent(orgId: string, eventType: string, summary: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await db.collection('organizations').doc(orgId).collection('system_logs').add({
    eventType,
    summary,
    metadata,
    timestamp: FieldValue.serverTimestamp()
  });
}

/**
 * Calculates the total value of "Potential Sales" (Pending/Confirmed orders).
 */
export async function getPotentialSalesValue(orgId: string): Promise<number> {
  const snapshot = await orgsRef.doc(orgId).collection('activities')
    .where('status', 'in', ['pending', 'confirmed'])
    .where('type', '==', 'order')
    .get();
  
  let totalKobo = 0;
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.amount) {
      // 🛡️ [WISDOM]: Robust parsing to handle strings, symbols, or numbers
      const rawValue = typeof data.amount === 'string' 
        ? data.amount.replace(/[^0-9.]/g, '') 
        : data.amount;
      
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        totalKobo += Math.round(parsed * 100);
      }
    }
  });
  return totalKobo;
}

/**
 * Calculates anonymized sales benchmarks for the network.
 * 🛡️ [RED TEAM]: Returns only averages to prevent individual data leakage.
 */
export async function getNetworkHealthInsight(orgId: string, dateStr: string): Promise<{ avgSalesKobo: number, totalActiveBots: number }> {
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

/**
 * Fetches basic stats for a specific organization (Used by Audit Tool)
 */
export async function getTenantAuditStats(orgId: string) {
  const orgDoc = await orgsRef.doc(orgId).get();
  if (!orgDoc.exists) return null;
  const data = orgDoc.data();
  
  return {
    balance: data?.balance || 0,
    isActive: data?.isActive,
    messageCount: data?.trialMessageCount || 0,
    lastSeen: data?.updatedAt ? (data.updatedAt as Timestamp).toDate().toISOString() : null
  };
}
export async function getOrgDailyStats(orgId: string, dateStr: string): Promise<{ salesKobo: number, expensesKobo: number, pendingActivities: number, newCustomers: number }> {
  const snapRef = orgsRef.doc(orgId).collection('daily_snapshots').doc(dateStr);
  const doc = await snapRef.get();

  const data = doc.exists ? doc.data() : { totalSalesKobo: 0, totalExpensesKobo: 0 };

  // Pending activities count
  const pendingSnap = await orgsRef.doc(orgId).collection('activities')
    .where('status', 'in', ['pending', 'confirmed', 'picked_up', 'in_transit'])
    .count()
    .get();

  return {
    salesKobo: data?.totalSalesKobo || 0,
    expensesKobo: data?.totalExpensesKobo || 0,
    pendingActivities: pendingSnap.data().count,
    newCustomers: 0 // Placeholder for future implementation
  };
}
