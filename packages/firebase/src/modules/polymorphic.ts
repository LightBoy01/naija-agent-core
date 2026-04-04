import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Saves a polymorphic entity to a tenant-specific sub-collection.
 * @param orgId The organization ID.
 * @param collectionName The name of the sub-collection (e.g., 'appointments', 'services').
 * @param data The entity data to save.
 * @returns The ID of the created document.
 */
export async function saveEntity(orgId: string, collectionName: string, data: any): Promise<string> {
  const docRef = await db.collection('organizations').doc(orgId).collection(collectionName).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  return docRef.id;
}

/**
 * Queries polymorphic entities from a tenant-specific sub-collection.
 * @param orgId The organization ID.
 * @param collectionName The name of the sub-collection.
 * @param filters An array of filters to apply (field, operator, value).
 * @returns An array of entities.
 */
export async function queryEntity(orgId: string, collectionName: string, filters: [string, FirebaseFirestore.WhereFilterOp, any][]): Promise<any[]> {
  let query: FirebaseFirestore.Query = db.collection('organizations').doc(orgId).collection(collectionName);

  for (const [field, op, value] of filters) {
    query = query.where(field, op, value);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
