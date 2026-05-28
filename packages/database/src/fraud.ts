import { getDb } from './db.js';
import { fraudRegistry } from './schema.js';
import { eq, count, and, ne } from 'drizzle-orm';
import { createHash } from 'crypto';

/**
 * Generates a privacy-preserving SHA-256 hash of a phone number.
 * This allows the network to track bad actors without storing PII.
 */
export function hashPhone(phone: string): string {
  // We use a simple hash. For higher security, a global pepper could be added via ENV.
  return createHash('sha256').update(phone.trim()).digest('hex');
}

/**
 * Reports a phone number for fraud.
 */
export async function reportFraud(orgId: string, phone: string, reason: string, evidenceUrl?: string) {
  const db = getDb();
  const phoneHash = hashPhone(phone);

  try {
    await db.insert(fraudRegistry).values({
      phoneHash,
      orgId,
      reason,
      evidenceUrl,
    }).onConflictDoUpdate({
      target: [fraudRegistry.phoneHash, fraudRegistry.orgId],
      set: { reason, evidenceUrl, createdAt: new Date() }
    });

    return { success: true, phoneHash };
  } catch (e) {
    console.error(`[DB] reportFraud failed:`, e);
    return { success: false };
  }
}

/**
 * ASP G2: The Scam-Shield Consensus Check.
 * Returns true if the phone hash has been flagged by 2+ DIFFERENT organizations.
 */
export async function isBlacklisted(phone: string): Promise<{ blacklisted: boolean; reportCount: number }> {
  const db = getDb();
  const phoneHash = hashPhone(phone);

  try {
    const result = await db.select({
      count: count(fraudRegistry.orgId)
    })
    .from(fraudRegistry)
    .where(eq(fraudRegistry.phoneHash, phoneHash));

    const reportCount = Number(result[0]?.count || 0);
    
    // G2 Rule: Consensus requires 2+ independent organizations
    return {
      blacklisted: reportCount >= 2,
      reportCount
    };
  } catch (e) {
    console.error(`[DB] isBlacklisted check failed:`, e);
    return { blacklisted: false, reportCount: 0 };
  }
}
