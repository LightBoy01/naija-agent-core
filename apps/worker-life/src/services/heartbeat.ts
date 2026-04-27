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
      // Deterministic Check: If it's a scheduled reminder
      if (config.type === 'reminder' && config.triggerTime) {
          const now = Date.now();
          if (now >= config.triggerTime && config.status === 'pending') {
              return { shouldMessage: true, contextData: { deterministic: true, payload: config.messagePayload } };
          }
          return { shouldMessage: false, contextData: {} };
      }

      // Polling Check: Fetch required data based on config
      let contextData = {};
      try {
          if (config.type === 'market') {
              contextData = await executeLifeTool('get_market_prices', {});
          }
      } catch (error: any) {
          logger.error({ error: error.message, configType: config.type }, 'Failed to gather context for heartbeat');
      }

      return { shouldMessage: true, contextData };
  }

  /**
   * Creates a deterministic reminder.
   */
  async createReminder(userId: string, triggerTime: number, messagePayload: string): Promise<any> {
      try {
          const db = getFirestore();
          const docRef = db.collection('users').doc(userId).collection('heartbeats').doc();
          
          const config = {
              type: 'reminder',
              triggerTime,
              messagePayload,
              status: 'pending',
              active: true,
              createdAt: Date.now()
          };
          
          await docRef.set(config);
          logger.info({ userId, configId: docRef.id, triggerTime }, '✅ Created new deterministic reminder');
          return { id: docRef.id, ...config };
      } catch (error: any) {
          logger.error({ error: error.message, userId }, '❌ Failed to create reminder');
          return { error: error.message };
      }
  }

  /**
   * Marks a heartbeat/reminder as completed or inactive.
   */
  async deactivateConfig(userId: string, configId: string, status: 'completed' | 'cancelled' = 'completed'): Promise<void> {
      try {
          const db = getFirestore();
          await db.collection('users').doc(userId).collection('heartbeats').doc(configId).update({
              active: false,
              status,
              updatedAt: Date.now()
          });
      } catch (error: any) {
          logger.error({ error: error.message, userId, configId }, 'Failed to deactivate config');
      }
  }

  /**
   * Creates a new heartbeat configuration for a user (Legacy/Polling).
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