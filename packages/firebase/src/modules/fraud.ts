import { 
  getFirestore, 
  FieldValue 
} from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Adds a phone number to the global fraud registry.
 */
export async function reportFraud(phone: string, reason: string): Promise<void> {
  await db.collection('global_fraud_registry').doc(phone).set({
    phone,
    reason,
    reportedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Checks if a phone number is in the global fraud registry.
 */
export async function checkFraud(phone: string): Promise<{ phone: string, reason: string } | null> {
  const doc = await db.collection('global_fraud_registry').doc(phone).get();
  return doc.exists ? doc.data() as any : null;
}
