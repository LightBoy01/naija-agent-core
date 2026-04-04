import { getFirestore } from 'firebase-admin/firestore';
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
      const db = getFirestore();
      const doc = await db.collection('users').doc(userId).collection('vault_secrets').doc(serviceName).get();
      
      if (!doc.exists) {
        return null;
      }
      return doc.data() as Record<string, string>;
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
      const db = getFirestore();
      await db.collection('users').doc(userId).collection('vault_secrets').doc(serviceName).set(credentials, { merge: true });
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
        const db = getFirestore();
        await db.collection('users').doc(userId).collection('vault_secrets').doc(serviceName).delete();
        logger.info({ userId, serviceName }, '🗑️ Deleted credentials from vault');
        return true;
      } catch (error: any) {
        logger.error({ error: error.message, userId, serviceName }, '❌ Failed to delete credentials from vault');
        return false;
      }
  }
}

export const vaultService = new VaultService();