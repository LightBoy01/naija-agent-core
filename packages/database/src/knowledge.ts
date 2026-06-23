import { getDb } from './db.js';
import { knowledge } from './schema.js';
import { eq } from 'drizzle-orm';

export async function getAllKnowledge(orgId: string): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select({
    key: knowledge.key,
    content: knowledge.content,
  }).from(knowledge).where(eq(knowledge.orgId, orgId));

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.content;
  }
  return result;
}
