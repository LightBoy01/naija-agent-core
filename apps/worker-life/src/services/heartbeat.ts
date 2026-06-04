import { getDb, heartbeats, eq, and, gt } from '@naija-agent/database';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import { executeLifeTool } from '../tools/index.js';

/**
 * Service to manage proactive Aelixxr actions (The Heartbeat Engine).
 */
class HeartbeatService {
  /**
   * Fetches active heartbeat configurations for a user.
   */
  async getUserConfigs(userId: string): Promise<any[]> {
    try {
        const sqlDb = getDb();
        return await sqlDb.select()
          .from(heartbeats)
          .where(and(eq(heartbeats.userId, userId), eq(heartbeats.active, true)));
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to fetch user heartbeat configs');
        return [];
    }
  }

  /**
   * Fetches all users who have an active heartbeat configuration.
   */
  async getAllActiveUsers(): Promise<string[]> {
      try {
          const sqlDb = getDb();
          const results = await sqlDb.selectDistinct({ userId: heartbeats.userId })
            .from(heartbeats)
            .where(eq(heartbeats.active, true));
          return results.map(r => r.userId);
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
              return { shouldMessage: true, contextData: { 
                  deterministic: true, 
                  payload: config.messagePayload,
                  vaultTopic: config.vaultTopic 
              } };
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
  async createReminder(userId: string, triggerTime: number, messagePayload: string, vaultTopic?: string): Promise<any> {
      try {
          const sqlDb = getDb();
          const id = randomUUID();
          
          const config = {
              id,
              userId,
              type: 'reminder',
              triggerTime,
              messagePayload,
              vaultTopic: vaultTopic || null,
              status: 'pending',
              active: true,
          };
          
          await sqlDb.insert(heartbeats).values(config);
          logger.info({ userId, configId: id, triggerTime, vaultTopic }, '✅ Created new deterministic reminder');
          return config;
      } catch (error: any) {
          logger.error({ error: error.message, userId }, '❌ Failed to create reminder');
          return { error: error.message };
      }
  }

  /**
   * Prevents duplicate/spam reminders within a 60s window.
   */
  async checkRecentReminder(userId: string, payload: string): Promise<boolean> {
      try {
          const sqlDb = getDb();
          const oneMinuteAgo = new Date(Date.now() - 60000);
          
          const results = await sqlDb.select({ id: heartbeats.id })
            .from(heartbeats)
            .where(
              and(
                eq(heartbeats.userId, userId),
                eq(heartbeats.status, 'pending'),
                eq(heartbeats.messagePayload, payload),
                gt(heartbeats.createdAt, oneMinuteAgo)
              )
            ).limit(1);
          
          return results.length > 0;
      } catch (e) {
          return false;
      }
  }

  /**
   * Marks a heartbeat/reminder as completed or inactive.
   */
  async deactivateConfig(userId: string, configId: string, status: 'completed' | 'cancelled' = 'completed'): Promise<void> {
      try {
          const sqlDb = getDb();
          await sqlDb.update(heartbeats)
            .set({ active: false, status, updatedAt: new Date() })
            .where(
              and(
                eq(heartbeats.userId, userId),
                eq(heartbeats.id, configId)
              )
            );
      } catch (error: any) {
          logger.error({ error: error.message, userId, configId }, 'Failed to deactivate config');
      }
  }

  /**
   * Creates a new heartbeat configuration for a user (Legacy/Polling).
   */
  async createHeartbeat(userId: string, type: string, query: string, intervalDescription: string): Promise<any> {
      try {
          const sqlDb = getDb();
          const id = randomUUID();
          
          const config = {
              id,
              userId,
              type,
              query,
              intervalDescription,
              active: true,
              status: 'pending'
          };
          
          await sqlDb.insert(heartbeats).values(config);
          logger.info({ userId, configId: id }, '✅ Created new heartbeat config');
          return config;
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
          const sqlDb = getDb();
          await sqlDb.delete(heartbeats)
            .where(
              and(
                eq(heartbeats.userId, userId),
                eq(heartbeats.id, configId)
              )
            );
          logger.info({ userId, configId }, '🗑️ Deleted heartbeat config');
          return { success: true, deletedId: configId };
      } catch (error: any) {
          logger.error({ error: error.message, userId, configId }, '❌ Failed to delete heartbeat config');
          return { error: error.message };
      }
  }
}

export const heartbeatService = new HeartbeatService();