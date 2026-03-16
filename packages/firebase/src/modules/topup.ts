import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { incrementNetworkStats } from './stats.js';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * Securely tops up a tenant's balance.
 * Requires a unique reference to prevent double-crediting.
 */
export async function topupTenant(
  orgId: string, 
  amountNaira: number, 
  reference: string
): Promise<{ newBalance: number } | null> {
  const amountKobo = Math.round(amountNaira * 100);
  const txRef = `topup_${reference}`;
  
  try {
    const result = await db.runTransaction(async (t) => {
      // 1. Idempotency Check: Has this reference been used?
      const refDoc = await t.get(db.collection('topup_references').doc(txRef));
      if (refDoc.exists) {
        throw new Error('DUPLICATE_REFERENCE');
      }

      // 2. Fetch Tenant
      const orgRef = orgsRef.doc(orgId);
      const orgDoc = await t.get(orgRef);
      if (!orgDoc.exists) throw new Error('TENANT_NOT_FOUND');

      const currentBalance = orgDoc.data()?.balance || 0;
      const newBalance = currentBalance + amountKobo;

      // 3. Update Balance and Burn Reference
      t.update(orgRef, { 
        balance: newBalance,
        updatedAt: FieldValue.serverTimestamp()
      });
      t.set(db.collection('topup_references').doc(txRef), {
        orgId,
        amountNaira,
        usedAt: FieldValue.serverTimestamp()
      });

      return { newBalance };
    });

    // 4. Update Global Network Stats (Kobo)
    await incrementNetworkStats({ koboDelta: amountKobo });

    return result;
  } catch (e: any) {
    console.warn(`❌ Top-up failed for ${orgId}:`, e.message);
    if (e.message === 'DUPLICATE_REFERENCE') throw e;
    return null;
  }
}
