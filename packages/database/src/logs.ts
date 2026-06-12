import { getDb } from './db.js';
import { systemLogs } from './schema.js';
import { randomUUID } from 'crypto';

/**
 * Logs a system-level event for the Audit Trail in PostgreSQL (Phase 10)
 */
export async function logSystemEvent(orgId: string, eventType: string, summary: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const db = getDb();
  try {
    await db.insert(systemLogs).values({
      id: randomUUID(),
      orgId,
      eventType,
      summary,
      metadata,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error('[DB] logSystemEvent failed:', e);
  }
}
