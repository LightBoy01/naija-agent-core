import { getDb } from '@naija-agent/firebase';
import { AcademicProfile } from '@naija-agent/types';
import { logger } from '../utils/logger.js';

export interface LifeContext {
  fullName?: string;
  family?: {
    children?: { name: string; age?: number; school?: string }[];
    spouse?: string;
  };
  health?: {
    allergies?: string[];
    medications?: string[];
  };
  goals?: string[]; // e.g., "Japa by 2027", "Buy land in Lekki"
  preferences?: {
    market?: string; // e.g., "Mile 12"
    diet?: string;
  };
  academicProfile?: AcademicProfile; // Added for Student Lifecycle
  lastInteraction?: Date;
  energyCredits?: number; // Added for the Battery/Energy System
}

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
   * Returns the new balance.
   */
  async addEnergy(phone: string, amount: number): Promise<number | null> {
    try {
      const db = getDb();
      const docRef = db.collection(this.collection).doc(phone);
      let newBalance: number | null = null;

      await db.runTransaction(async (t: any) => {
        const doc = await t.get(docRef);
        
        let currentBalance = 0;
        if (doc.exists) {
          const data = doc.data() as LifeContext;
          currentBalance = data.energyCredits || 0;
        }

        newBalance = currentBalance + amount;
        t.set(docRef, { energyCredits: newBalance, lastInteraction: new Date() }, { merge: true });
      });

      logger.info({ phone, added: amount, newBalance }, '🔋 Energy Added Successfully');
      return newBalance;
    } catch (e: any) {
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
      
      logger.info({ phone, updates }, '💾 Updated Life Memory');
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to update Life Context');
    }
  }
}

export const lifeMemory = new LifeMemoryService();
