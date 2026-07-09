import { getDb } from './db.js';
import { disputes } from './schema.js';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createDispute(orgId: string, reference: string, amount: number, currency: string, reason: string) {
  const db = getDb();
  
  await db.insert(disputes).values({
    id: `dispute_${randomUUID()}`,
    orgId,
    reference,
    amount: amount.toString() as any, // Drizzle numeric
    currency,
    reason,
    status: 'open'
  }).onConflictDoNothing({ target: disputes.reference }); // Prevent duplicate dispute logs
}

export async function resolveDispute(reference: string, resolutionStatus: 'resolved' | 'won' | 'lost' | 'refunded') {
  const db = getDb();
  await db.update(disputes)
    .set({
      status: resolutionStatus,
      updatedAt: new Date()
    })
    .where(eq(disputes.reference, reference));
}

export async function getDisputesForOrg(orgId: string) {
  const db = getDb();
  return db.select().from(disputes).where(eq(disputes.orgId, orgId));
}
