import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { 
  getDb 
} from '../index.js';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * Saves a piece of business knowledge (Price, Policy, Fact)
 */
export async function saveKnowledge(orgId: string, key: string, content: string, imageUrl?: string): Promise<void> {
  const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '_');
  await orgsRef.doc(orgId).collection('knowledge').doc(slug).set({
    key,
    content,
    imageUrl: imageUrl || null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Fetches all knowledge for an organization
 */
export async function getAllKnowledge(orgId: string): Promise<Record<string, string>> {
  const snapshot = await orgsRef.doc(orgId).collection('knowledge').get();
  const knowledge: Record<string, string> = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    knowledge[data.key] = data.content;
  });
  return knowledge;
}

/**
 * Deletes a specific piece of knowledge
 */
export async function deleteKnowledge(orgId: string, key: string): Promise<void> {
  const slug = key.toLowerCase().replace(/[^a-z0-9]/g, '_');
  await orgsRef.doc(orgId).collection('knowledge').doc(slug).delete();
}
