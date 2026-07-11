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

export async function saveKnowledge(orgId: string, key: string, content: string, imageUrl?: string): Promise<void> {
  const db = getDb();
  const slug = `${orgId}_${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  
  await db.insert(knowledge).values({
    slug,
    orgId,
    key,
    content,
    imageUrl: imageUrl || null,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: knowledge.slug,
    set: {
      content,
      imageUrl: imageUrl || null,
      updatedAt: new Date()
    }
  });
}

export async function deleteKnowledge(orgId: string, key: string): Promise<void> {
  const db = getDb();
  const slug = `${orgId}_${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  await db.delete(knowledge).where(eq(knowledge.slug, slug));
}
