import { getDb } from '@naija-agent/firebase';
import { VaultAuditLog } from '@naija-agent/types';
import { logger } from '../utils/logger.js';

export class AuditService {
  private collection = 'vault_audit_logs';

  /**
   * Logs a financial or high-consequence action for forensic audit.
   */
  async logVaultAction(log: Omit<VaultAuditLog, 'id' | 'timestamp'>, customId?: string): Promise<string | null> {
    try {
      const db = getDb();
      const id = customId || `${log.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const timestamp = new Date();
      
      const fullLog: VaultAuditLog = {
        id,
        timestamp,
        ...log
      };

      await db.collection(this.collection).doc(id).set(fullLog);
      
      logger.info({ userId: log.userId, toolName: log.toolName, status: log.status }, '📑 Vault Action Logged');
      return id;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to log vault action');
      return null;
    }
  }

  /**
   * Updates an existing audit log (e.g., from pending to success/failed).
   */
  async updateLogStatus(logId: string, status: 'success' | 'failed', metadata?: Record<string, unknown>): Promise<void> {
      try {
          const db = getDb();
          const docRef = db.collection(this.collection).doc(logId);
          const update: any = { status };
          if (metadata) {
              update.metadata = metadata;
          }
          await docRef.update(update);
          logger.info({ logId, status }, '📑 Vault Action Status Updated');
      } catch (error: any) {
          logger.error({ logId, error: error.message }, 'Failed to update vault log status');
      }
  }
}

export const auditService = new AuditService();
