import { getDb, vaultSecrets } from '@naija-agent/database';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

export interface UserCredentials {
  [serviceName: string]: Record<string, string>;
}

/**
 * Service to securely manage and retrieve user-specific credentials (The IronClaw Vault).
 * Credentials should never be passed directly to the AI model.
 */
class VaultService {
  /**
   * Fetches the credentials for a specific user and service.
   * @param userId The user's phone number or ID.
   * @param serviceName The name of the service (e.g., 'twitter', 'github').
   */
  async getCredentials(userId: string, serviceName: string): Promise<Record<string, string> | null> {
    try {
      const sqlDb = getDb();
      const result = await sqlDb.select()
        .from(vaultSecrets)
        .where(
          and(
            eq(vaultSecrets.userId, userId),
            eq(vaultSecrets.serviceName, serviceName)
          )
        ).limit(1);

      if (result.length === 0) return null;
      return result[0].credentials as Record<string, string>;
    } catch (error: any) {
      logger.error({ error: error.message, userId, serviceName }, '❌ Failed to retrieve credentials from vault');
      return null;
    }
  }

  /**
   * Securely saves credentials for a specific user and service.
   */
  async saveCredentials(userId: string, serviceName: string, credentials: Record<string, string>): Promise<boolean> {
    try {
      const sqlDb = getDb();
      // Upsert logic
      const existing = await sqlDb.select({ id: vaultSecrets.id }).from(vaultSecrets).where(and(eq(vaultSecrets.userId, userId), eq(vaultSecrets.serviceName, serviceName))).limit(1);
      
      if (existing.length > 0) {
        await sqlDb.update(vaultSecrets)
          .set({ credentials, updatedAt: new Date() })
          .where(eq(vaultSecrets.id, existing[0].id));
      } else {
        await sqlDb.insert(vaultSecrets).values({
          id: randomUUID(),
          userId,
          serviceName,
          credentials
        });
      }
      logger.info({ userId, serviceName }, '🔐 Securely saved credentials to vault');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message, userId, serviceName }, '❌ Failed to save credentials to vault');
      return false;
    }
  }

  /**
   * Deletes a credential.
   */
  async deleteCredentials(userId: string, serviceName: string): Promise<boolean> {
    try {
      const sqlDb = getDb();
      await sqlDb.delete(vaultSecrets)
        .where(
          and(
            eq(vaultSecrets.userId, userId),
            eq(vaultSecrets.serviceName, serviceName)
          )
        );
      logger.info({ userId, serviceName }, '🗑️ Deleted credentials from vault');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message, userId, serviceName }, '❌ Failed to delete credentials from vault');
      return false;
    }
  }
}

export const vaultService = new VaultService();