import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { TransactionData } from '@naija-agent/types';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * Checks for duplicate transactions to prevent replay attacks.
 */
export async function checkTransaction(orgId: string, reference: string): Promise<any | null> {
  const txId = `${orgId}_${reference}`;
  const doc = await db.collection('transactions').doc(txId).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Logs a transaction as pending, awaiting SMS confirmation.
 */
export async function logPendingTransaction(orgId: string, from: string, amount: number, reference: string): Promise<void> {
  const txId = `${orgId}_${reference}`;
  await db.collection('transactions').doc(txId).set({
    orgId,
    from,
    amount,
    reference,
    status: 'pending',
    verifiedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Logs a confirmed transaction.
 */
export async function logTransaction(orgId: string, reference: string, data: Partial<TransactionData>): Promise<void> {
  const txId = `${orgId}_${reference}`;
  await db.collection('transactions').doc(txId).set({
    orgId,
    reference,
    status: 'success', // Default for legacy/direct verification
    ...data,
    verifiedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Searches for a pending transaction matching the amount.
 */
export async function findPendingTransaction(orgId: string, amount: number): Promise<any | null> {
  const snapshot = await db.collection('transactions')
    .where('orgId', '==', orgId)
    .where('amount', '==', amount)
    .where('status', '==', 'pending')
    .orderBy('verifiedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Confirms a pending transaction and links it to an SMS alert
 */
export async function confirmTransaction(txId: string, smsId: string): Promise<void> {
  await db.collection('transactions').doc(txId).update({
    status: 'success',
    smsId,
    confirmedAt: FieldValue.serverTimestamp(),
  });
}
