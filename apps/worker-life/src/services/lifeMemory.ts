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
      const doc = await db.collection(this.collection).doc(phone).get();
      
      if (!doc.exists) {
        return { lastInteraction: new Date() };
      }
      return doc.data() as LifeContext;
    } catch (error: any) {
      logger.error({ phone, error: error.message }, 'Failed to fetch Life Context');
      return {};
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
