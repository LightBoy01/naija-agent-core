import { getDb, users, lt } from '@naija-agent/database';
import { logger } from '../utils/logger.js';

export class ProactiveService {
  /**
   * Finds users who haven't interacted in over X hours.
   */
  async getUsersNeedingNudge(hours: number = 48): Promise<string[]> {
    try {
      const sqlDb = getDb();
      // Calculate date in JavaScript to avoid Postgres timezone quirks
      const cutoffDate = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      const results = await sqlDb.select({ phone: users.phone })
        .from(users)
        .where(lt(users.updatedAt, cutoffDate))
        .limit(50);
        
      return results.map(row => row.phone);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch users needing nudge');
      return [];
    }
  }
}

export const proactiveService = new ProactiveService();