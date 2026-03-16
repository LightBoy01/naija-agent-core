import { 
  getFirestore 
} from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Fetches media for a specific organization only.
 */
export async function getOrgMedia(orgId: string, limit = 24): Promise<any[]> {
  const snapshot = await db.collectionGroup('messages')
    .where('type', 'in', ['image', 'audio'])
    .where('orgId', '==', orgId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    chatId: doc.ref.parent.parent?.id,
    ...doc.data()
  }));
}

/**
 * Fetches all media (images/audio) across the network using a collection group query
 */
export async function getNetworkMedia(orgId: string, limit = 24): Promise<any[]> {
  if (orgId !== 'naija-agent-master') {
    throw new Error('UNAUTHORIZED_GLOBAL_QUERY: This action is restricted to the Sovereign HQ.');
  }

  const snapshot = await db.collectionGroup('messages')
    .where('type', 'in', ['image', 'audio'])
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    chatId: doc.ref.parent.parent?.id,
    ...doc.data()
  }));
}
