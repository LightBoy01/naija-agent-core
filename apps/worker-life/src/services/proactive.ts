import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import { lifeMemory } from './lifeMemory.js';

export class ProactiveService {
  /**
   * Finds users who haven't interacted in over X hours.
   */
  async getUsersNeedingNudge(hours: number = 48): Promise<string[]> {
    try {
      const db = getFirestore();
      const cutoffDate = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      const snapshot = await db.collection('user_profiles')
        .where('lastInteraction', '<', cutoffDate)
        .limit(50)
        .get();
        
      return snapshot.docs.map(doc => doc.id);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to fetch users needing nudge');
      return [];
    }
  }
}

export const proactiveService = new ProactiveService();