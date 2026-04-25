import { getDb } from '@naija-agent/firebase';
import { AcademicProfile, LifeContext } from '@naija-agent/types';
import { logger } from '../utils/logger.js';

export class LifeMemoryService {
  private collection = 'user_profiles'; // Separate from 'organizations' (BOS)

  /**
   * Retrieves the full Life Context for a user (Phone Number).
   * This context is fed into Gemini 1.5 Pro to give it "Long Term Memory".
   */
  async getContext(phone: string): Promise<LifeContext> {
    try {
      const db = getDb();
      const docRef = db.collection(this.collection).doc(phone);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        // --- WELCOME BONUS ---
        // Give new users 100 Energy Credits (₦1,000 equivalent)
        const initialContext: LifeContext = { 
          lastInteraction: new Date(),
          energyCredits: 100 
        };
        await docRef.set(initialContext);
        logger.info({ phone }, '🎁 New user registered! Granted 100 Welcome Bonus Credits.');
        return initialContext;
      }
      return doc.data() as LifeContext;
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Life Context');
      return {};
    }
  }

  /**
   * Deducts energy credits from a user securely using a transaction.
   * Returns the new balance, or null if insufficient.
   */
  async deductEnergy(phone: string, amount: number): Promise<number | null> {
    try {
      const db = getDb();
      const docRef = db.collection(this.collection).doc(phone);
      let newBalance: number | null = null;

      await db.runTransaction(async (t: any) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error('User profile not found');

        const data = doc.data() as LifeContext;
        const currentBalance = data.energyCredits || 0;

        // Allow overdraft down to -2 for emergency reserves
        if (currentBalance < amount && (currentBalance - amount < -2)) {
          throw new Error(`Insufficient energy: ${currentBalance} < ${amount}`);
        }

        newBalance = currentBalance - amount;
        t.update(docRef, { energyCredits: newBalance });
      });

      return newBalance;
    } catch (e: any) {
      logger.warn({ phone, error: e.message }, `Energy deduction failed`);
      return null;
    }
  }

  /**
   * Adds energy credits to a user securely using a transaction.
   * Prevents duplicate top-ups if a unique reference is provided.
   * Returns the new balance.
   */
  async addEnergy(phone: string, amount: number, reference?: string): Promise<number | null> {
    try {
      const db = getDb();
      const docRef = db.collection(this.collection).doc(phone);
      let newBalance: number | null = null;

      await db.runTransaction(async (t: any) => {
        // 1. Idempotency Check
        if (reference && reference.toLowerCase() !== 'unknown') {
            const txRef = `energy_topup_${reference}`;
            const refDoc = await t.get(db.collection('energy_topup_references').doc(txRef));
            if (refDoc.exists) {
                throw new Error('DUPLICATE_REFERENCE');
            }
            // Burn the reference immediately in the transaction
            t.set(db.collection('energy_topup_references').doc(txRef), {
                phone,
                amount,
                usedAt: new Date()
            });
        }

        const doc = await t.get(docRef);
        
        let currentBalance = 0;
        if (doc.exists) {
          const data = doc.data() as LifeContext;
          currentBalance = data.energyCredits || 0;
        }

        newBalance = currentBalance + amount;
        t.set(docRef, { energyCredits: newBalance, lastInteraction: new Date() }, { merge: true });
      });

      logger.info({ phone, added: amount, newBalance, reference }, '🔋 Energy Added Successfully');
      return newBalance;
    } catch (e: any) {
      if (e.message === 'DUPLICATE_REFERENCE') {
          logger.warn({ phone, reference }, `Blocked duplicate energy top-up attempt`);
          throw e; // Re-throw so the tool can tell the user it was already used
      }
      logger.warn({ phone, error: e.message }, `Energy addition failed`);
      return null;
    }
  }

  /**
   * Check if a user's LifeContext already exists.
   */
  async checkExists(phone: string): Promise<boolean> {
    try {
      const db = getDb();
      const doc = await db.collection(this.collection).doc(phone).get();
      return doc.exists;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Updates specific fields in the user's Life Context.
   * Merges with existing data.
   */
  async updateContext(phone: string, updates: Partial<LifeContext>): Promise<void> {
    try {
      const db = getDb();
      await db.collection(this.collection).doc(phone).set({
        ...updates,
        lastInteraction: new Date()
      }, { merge: true });
      
      logger.info({ phone, updates }, '💾 Updated Life Memory (Semantic)');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to update Life Context');
    }
  }

  /**
   * (SEEM Architecture)
   * Saves an Episodic Event: A chronological narrative event.
   */
  async saveEpisodicEvent(phone: string, title: string, details: string, emotionalValence: string = 'neutral'): Promise<void> {
    try {
      const db = getDb();
      const event = {
        title,
        details,
        emotionalValence,
        timestamp: new Date()
      };
      await db.collection(this.collection).doc(phone).collection('episodic_events').add(event);
      logger.info({ phone, title, emotionalValence }, '📖 Saved Episodic Event to Vault History');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to save Episodic Event');
    }
  }

  /**
   * (SEEM Architecture)
   * Fetches recent Episodic Events to provide temporal narrative context to Aelixxr.
   */
  async getRecentEpisodicEvents(phone: string, limit: number = 5): Promise<any[]> {
    try {
      const db = getDb();
      const snapshot = await db.collection(this.collection).doc(phone).collection('episodic_events')
        .orderBy('timestamp', 'desc').limit(limit).get();
      return snapshot.docs.map(doc => doc.data()).reverse();
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Episodic Events');
      return [];
    }
  }
}

export const lifeMemory = new LifeMemoryService();
