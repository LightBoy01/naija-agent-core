import { eq, sql, and, desc } from 'drizzle-orm';
import { getDb } from './db.js';
import { dailySnapshots, activities, networkMetadata, organizations } from './schema.js';

/**
 * Atomically increments daily sales in the snapshot for the current date.
 */
export async function incrementDailySales(orgId: string, kobo: number): Promise<void> {
  const db = getDb();
  const date = new Date().toISOString().split('T')[0];
  
  await db.insert(dailySnapshots).values({
    orgId,
    date,
    totalSalesKobo: kobo,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: [dailySnapshots.orgId, dailySnapshots.date],
    set: {
      totalSalesKobo: sql`${dailySnapshots.totalSalesKobo} + ${kobo}`,
      updatedAt: new Date()
    }
  });
}

/**
 * Atomically increments daily expenses (bot usage costs) in the snapshot for the current date.
 */
export async function incrementDailyExpenses(orgId: string, kobo: number): Promise<void> {
  const db = getDb();
  const date = new Date().toISOString().split('T')[0];
  
  await db.insert(dailySnapshots).values({
    orgId,
    date,
    totalExpensesKobo: kobo,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: [dailySnapshots.orgId, dailySnapshots.date],
    set: {
      totalExpensesKobo: sql`${dailySnapshots.totalExpensesKobo} + ${kobo}`,
      updatedAt: new Date()
    }
  });
}

/**
 * Fetches the last N daily snapshots for an organization.
 */
export async function getWeeklySummary(orgId: string, limit = 7): Promise<any[]> {
  const db = getDb();
  const results = await db.select()
    .from(dailySnapshots)
    .where(eq(dailySnapshots.orgId, orgId))
    .orderBy(desc(dailySnapshots.date))
    .limit(limit);
    
  return results.reverse();
}

/**
 * Calculates the total value of "Potential Sales" (Pending/Confirmed orders).
 */
export async function getPotentialSalesValue(orgId: string): Promise<number> {
  const db = getDb();
  const results = await db.select({ amount: activities.amount })
    .from(activities)
    .where(and(
      eq(activities.orgId, orgId),
      eq(activities.type, 'order'),
      sql`${activities.status} IN ('pending', 'confirmed')`
    ));
  
  let totalKobo = 0;
  results.forEach(row => {
    if (row.amount) {
      totalKobo += Math.round(parseFloat(row.amount) * 100);
    }
  });
  return totalKobo;
}

/**
 * Calculates anonymized sales benchmarks for the network.
 */
export async function getNetworkHealthInsight(orgId: string, dateStr: string): Promise<{ avgSalesKobo: number, totalActiveBots: number }> {
  const db = getDb();
  
  const results = await db.select({ totalSales: dailySnapshots.totalSalesKobo })
    .from(dailySnapshots)
    .where(eq(dailySnapshots.date, dateStr));

  let totalSales = 0;
  let count = results.length;

  results.forEach(row => {
    totalSales += row.totalSales;
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
  const db = getDb();
  const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  
  if (org.length === 0) return null;
  const data = org[0];
  
  return {
    balance: data.balanceKobo,
    isActive: data.isActive,
    status: data.status,
    lastSeen: data.updatedAt.toISOString()
  };
}

export async function getOrgDailyStats(orgId: string, dateStr: string) {
  const db = getDb();
  const snap = await db.select().from(dailySnapshots).where(and(eq(dailySnapshots.orgId, orgId), eq(dailySnapshots.date, dateStr))).limit(1);
  const data = snap[0] || { totalSalesKobo: 0, totalExpensesKobo: 0 };

  const pendingCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM activities WHERE org_id = ${orgId} AND status IN ('pending', 'confirmed', 'picked_up', 'in_transit')`);
  const pendingActivities = Number(pendingCountResult[0]?.count || 0);

  return {
    salesKobo: data.totalSalesKobo,
    expensesKobo: data.totalExpensesKobo,
    pendingActivities,
    newCustomers: 0 // Placeholder
  };
}
