import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { Organization } from '@naija-agent/types';
import { incrementNetworkStats } from './stats.js';

const db = getFirestore();
const orgsRef = db.collection('organizations');

export async function addBalance(orgId: string, amount: number): Promise<number | null> {
  const orgRef = orgsRef.doc(orgId);
  let newBalance: number | null = null;

  try {
    await db.runTransaction(async (t: any) => {
      const doc = await t.get(orgRef);
      if (!doc.exists) throw new Error('Org not found');

      const data = doc.data() as Organization;
      const currentBalance = data.balance || 0;

      newBalance = currentBalance + amount;
      t.update(orgRef, { balance: newBalance });
    });

    // Update global vault total
    await incrementNetworkStats({ koboDelta: amount });
    
    return newBalance;
  } catch (e) {
    console.warn(`Balance addition failed for ${orgId}:`, e);
    return null;
  }
}

export async function deductBalance(orgId: string, amount: number): Promise<number | null> {
  const orgRef = orgsRef.doc(orgId);
  let newBalance: number | null = null;
  
  try {
    await db.runTransaction(async (t: any) => {
      const doc = await t.get(orgRef);
      if (!doc.exists) throw new Error('Org not found');
      
      const data = doc.data() as Organization;
      const currentBalance = data.balance || 0;

      if (currentBalance < amount) {
        throw new Error(`Insufficient balance: ${currentBalance} < ${amount}`);
      }
      
      newBalance = currentBalance - amount;
      t.update(orgRef, { balance: newBalance });
    });

    // Update global vault total (Decrement) - Fire-and-Forget with Safety Log
    try {
      await incrementNetworkStats({ koboDelta: -amount });
    } catch (statsErr: any) {
      console.warn(`⚠️ [LEDGER DRIFT] Failed to update global stats for deduction: ${statsErr.message}`);
      await db.collection('failed_ledger_updates').add({
        orgId,
        delta: -amount,
        reason: statsErr.message,
        timestamp: FieldValue.serverTimestamp()
      });
    }

    return newBalance;
  } catch (e) {
    console.warn(`Balance deduction failed for ${orgId}:`, e);
    return null;
  }
}
