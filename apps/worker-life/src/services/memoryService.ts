import { getDb, memories, eq, sql, and, desc } from '@naija-agent/database';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export class MemoryService {
  async saveEpisodicEvent(phone: string, title: string, details: string, emotionalValence: string = 'neutral', orgId: string = 'naija-agent-master'): Promise<void> {
    try {
      const sqlDb = getDb();
      await sqlDb.insert(memories).values({
        id: randomUUID(),
        userId: phone,
        orgId,
        category: 'episodic',
        content: JSON.stringify({ title, details, emotionalValence }),
        embedding: null,
        importance: 1
      });
      logger.info({ phone, title, emotionalValence }, '📖 Saved Episodic Event to PostgreSQL (memories)');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to save Episodic Event');
    }
  }

  async getRecentEpisodicEvents(phone: string, limitNum: number = 5): Promise<any[]> {
    try {
      const sqlDb = getDb();
      const results = await sqlDb.select()
        .from(memories)
        .where(and(eq(memories.userId, phone), eq(memories.category, 'episodic')))
        .orderBy(desc(memories.createdAt))
        .limit(limitNum);
        
      return results.map(row => JSON.parse(row.content)).reverse();
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Episodic Events');
      return [];
    }
  }

  async saveSemanticMemory(userId: string, orgId: string, category: string, content: string, embedding: number[], importance: number = 1): Promise<void> {
    try {
      const sqlDb = getDb();
      await sqlDb.insert(memories).values({
        id: randomUUID(),
        userId, orgId, category, content,
        embedding: sql`${'[' + embedding.join(',') + ']' }::vector` as any,
        importance
      });
      logger.info({ userId, category }, '🧠 Saved Semantic Memory to PostgreSQL (pgvector)');
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Failed to save Semantic Memory');
    }
  }

  async searchSemanticMemory(userId: string, embedding: number[], limit: number = 5): Promise<any[]> {
    try {
      const sqlDb = getDb();
      const results = await sqlDb.select()
        .from(memories)
        .where(sql`${memories.userId} = ${userId}` as any)
        .orderBy(sql`${memories.embedding} <=> ${'[' + embedding.join(',') + ']'}` as any)
        .limit(limit);
      return results;
    } catch (error: any) {
      logger.error({ userId, error: error.message }, 'Failed to search Semantic Memory');
      return [];
    }
  }
}

export const memoryService = new MemoryService();
