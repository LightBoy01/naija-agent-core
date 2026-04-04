import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import { executeLifeTool } from '../tools.js';

/**
 * Service to manage proactive Aelixxr actions (The Heartbeat Engine).
 */
class HeartbeatService {
  /**
   * Fetches active heartbeat configurations for a user.
   */
  async getUserConfigs(userId: string): Promise<any[]> {
    try {
        const db = getFirestore();
        const snapshot = await db.collection('users').doc(userId).collection('heartbeats').where('active', '==', true).get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to fetch user heartbeat configs');
        return [];
    }
  }

  /**
   * Fetches all users who have an active heartbeat configuration.
   * Note: In a large-scale system, this would need to be paginated or indexed differently.
   */
  async getAllActiveUsers(): Promise<string[]> {
      try {
          const db = getFirestore();
          // Find users that have active heartbeats. 
          // A collectionGroup query might be more efficient for production.
          const snapshot = await db.collectionGroup('heartbeats').where('active', '==', true).get();
          
          if (snapshot.empty) return [];
          
          // Extract unique user IDs from the paths
          const userIds = new Set<string>();
          snapshot.docs.forEach(doc => {
              const parentPath = doc.ref.parent.parent?.id;
              if (parentPath) userIds.add(parentPath);
          });
          
          return Array.from(userIds);
      } catch (error: any) {
          logger.error({ error: error.message }, 'Failed to fetch active heartbeat users');
          return [];
      }
  }

  /**
   * Evaluates if a heartbeat should trigger a message.
   */
  async evaluateConfig(config: any): Promise<{ shouldMessage: boolean, contextData: any }> {
      // Fetch required data based on config
      let contextData = {};
      try {
          if (config.type === 'market') {
              contextData = await executeLifeTool('get_market_prices', {});
          }
          // Add other data sources here (e.g., weather, calendar)
      } catch (error: any) {
          logger.error({ error: error.message, configType: config.type }, 'Failed to gather context for heartbeat');
      }

      // For now, we will let the AI decide if it should message based on the gathered data
      return { shouldMessage: true, contextData };
  }

  /**
   * Creates a new heartbeat configuration for a user.
   */
  async createHeartbeat(userId: string, type: string, query: string, intervalDescription: string): Promise<any> {
      try {
          const db = getFirestore();
          const docRef = db.collection('users').doc(userId).collection('heartbeats').doc();
          
          const config = {
              type, // e.g., 'market', 'reminder', 'custom'
              query, // What to monitor (e.g., 'Price of Rice', 'Doctor appointment')
              intervalDescription, // Natural language interval ('every morning', 'every 3 hours')
              active: true,
              createdAt: Date.now()
          };
          
          await docRef.set(config);
          logger.info({ userId, configId: docRef.id }, '✅ Created new heartbeat config');
          return { id: docRef.id, ...config };
      } catch (error: any) {
          logger.error({ error: error.message, userId }, '❌ Failed to create heartbeat config');
          return { error: error.message };
      }
  }

  /**
   * Deletes a heartbeat configuration.
   */
  async deleteHeartbeat(userId: string, configId: string): Promise<any> {
      try {
          const db = getFirestore();
          await db.collection('users').doc(userId).collection('heartbeats').doc(configId).delete();
          logger.info({ userId, configId }, '🗑️ Deleted heartbeat config');
          return { success: true, deletedId: configId };
      } catch (error: any) {
          logger.error({ error: error.message, userId, configId }, '❌ Failed to delete heartbeat config');
          return { error: error.message };
      }
  }
}

export const heartbeatService = new HeartbeatService();