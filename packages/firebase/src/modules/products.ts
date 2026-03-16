import { 
  getFirestore, 
  FieldValue, 
  Timestamp 
} from 'firebase-admin/firestore';
import { Product } from '@naija-agent/types';

const db = getFirestore();
const orgsRef = db.collection('organizations');

/**
 * Fetches all products for an organization.
 */
export async function getProducts(orgId: string): Promise<Product[]> {
  const snapshot = await orgsRef.doc(orgId).collection('products').orderBy('name').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
}

/**
 * Saves a product to the staging area for Boss review (Phase 8.2)
 */
export async function saveStagingProduct(orgId: string, id: string, data: any): Promise<void> {
  await orgsRef.doc(orgId).collection('staging_products').doc(id).set({
    ...data,
    updatedAt: FieldValue.serverTimestamp()
  });
}

/**
 * Fetches all products currently in staging.
 */
export async function getStagingProducts(orgId: string): Promise<any[]> {
  const snapshot = await orgsRef.doc(orgId).collection('staging_products').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Moves all staging products to the live catalog.
 */
export async function commitStagingProducts(orgId: string): Promise<void> {
  const stagingRef = orgsRef.doc(orgId).collection('staging_products');
  const productsRef = orgsRef.doc(orgId).collection('products');
  const snapshot = await stagingRef.get();

  const batch = db.batch();
  snapshot.forEach(doc => {
    const data = doc.data();
    const updateData: any = { ...data, updatedAt: FieldValue.serverTimestamp() };
    if (data.name) updateData.nameLowercase = data.name.toLowerCase();
    
    batch.set(productsRef.doc(doc.id), updateData, { merge: true });
    batch.delete(stagingRef.doc(doc.id));
  });

  await batch.commit();
}

/**
 * Clears the staging area.
 */
export async function clearStagingProducts(orgId: string): Promise<void> {
  const stagingRef = orgsRef.doc(orgId).collection('staging_products');
  const snapshot = await stagingRef.get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(stagingRef.doc(doc.id)));
  await batch.commit();
}

/**
 * Saves or updates a product in the structured catalog.
 */
export async function saveProduct(orgId: string, id: string, data: { 
  name?: string; 
  price?: number; 
  stock?: number; 
  category?: string; 
  imageUrl?: string;
  lowStockThreshold?: number;
}): Promise<void> {
  const updateData: any = { ...data, updatedAt: FieldValue.serverTimestamp() };
  
  if (data.name) {
    updateData.nameLowercase = data.name.toLowerCase();
  }

  // 🛡️ [PHASE 7.1]: Auto-flag low stock for O(1) indexed querying
  if (data.stock !== undefined) {
    const threshold = data.lowStockThreshold ?? 3;
    updateData.isLowStock = data.stock <= threshold;
  }

  await orgsRef.doc(orgId).collection('products').doc(id).set(updateData, { merge: true });
}

/**
 * Searches for products based on a query string.
 */
export async function searchProducts(orgId: string, query: string, limit = 5): Promise<Product[]> {
  const normalizedQuery = query.toLowerCase();
  
  const snapshot = await orgsRef.doc(orgId).collection('products')
    .where('nameLowercase', '>=', normalizedQuery)
    .where('nameLowercase', '<=', normalizedQuery + '\uf8ff')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
}

/**
 * Deletes a product from the catalog.
 */
export async function deleteProduct(orgId: string, productId: string): Promise<void> {
  await orgsRef.doc(orgId).collection('products').doc(productId).delete();
}

/**
 * Atomically decrements stock for a product.
 * Returns the new stock level.
 */
export async function decrementStock(orgId: string, productId: string, quantity: number): Promise<number> {
  const productRef = orgsRef.doc(orgId).collection('products').doc(productId);
  
  return await db.runTransaction(async (t) => {
    const doc = await t.get(productRef);
    if (!doc.exists) throw new Error('PRODUCT_NOT_FOUND');
    
    const data = doc.data();
    const currentStock = data?.stock ?? 0;
    const newStock = Math.max(0, currentStock - quantity);
    
    // Update low stock flag atomically
    const threshold = data?.lowStockThreshold ?? 3;
    
    t.update(productRef, { 
      stock: newStock,
      isLowStock: newStock <= threshold,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    return newStock;
  });
}

/**
 * SOFT-RESERVATION (Phase 7.2): Atomically reserves stock during checkout.
 * Returns success/failure if any item is unavailable.
 */
export async function reserveStock(orgId: string, items: { productId: string, quantity: number }[]): Promise<boolean> {
  try {
    await db.runTransaction(async (t) => {
      for (const item of items) {
        const productRef = orgsRef.doc(orgId).collection('products').doc(item.productId);
        const doc = await t.get(productRef);
        if (!doc.exists) throw new Error(`PRODUCT_NOT_FOUND: ${item.productId}`);
        
        const data = doc.data();
        const currentStock = data?.stock ?? 0;
        const currentReserved = data?.reserved ?? 0;
        const available = currentStock - currentReserved;

        if (available < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK: ${data?.name}`);
        }

        t.update(productRef, {
          reserved: FieldValue.increment(item.quantity),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    });
    return true;
  } catch (e) {
    console.warn(`❌ Stock reservation failed for ${orgId}:`, (e as Error).message);
    return false;
  }
}

/**
 * RELEASE RESERVATION (Phase 7.2): Returns reserved units to the available pool.
 */
export async function releaseStock(orgId: string, items: { productId: string, quantity: number }[]): Promise<void> {
  const batch = db.batch();
  for (const item of items) {
    const productRef = orgsRef.doc(orgId).collection('products').doc(item.productId);
    batch.update(productRef, {
      reserved: FieldValue.increment(-item.quantity),
      updatedAt: FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
}

/**
 * FINALIZE SALE (Phase 7.2): Converts reserved units into permanent stock deduction.
 */
export async function finalizeSale(orgId: string, items: { productId: string, quantity: number }[]): Promise<void> {
  await db.runTransaction(async (t) => {
    for (const item of items) {
      const productRef = orgsRef.doc(orgId).collection('products').doc(item.productId);
      const doc = await t.get(productRef);
      if (!doc.exists) continue;

      const data = doc.data();
      const currentStock = data?.stock ?? 0;
      const currentReserved = data?.reserved ?? 0;
      
      const newStock = Math.max(0, currentStock - item.quantity);
      const newReserved = Math.max(0, currentReserved - item.quantity);

      const threshold = data?.lowStockThreshold ?? 3;

      t.update(productRef, {
        stock: newStock,
        reserved: newReserved,
        isLowStock: newStock <= threshold,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  });
}

/**
 * Fetches products that are below their low-stock threshold.
 * Uses O(1) indexed query (isLowStock flag).
 */
export async function getLowStockItems(orgId: string): Promise<Product[]> {
  const snapshot = await orgsRef.doc(orgId).collection('products')
    .where('isLowStock', '==', true)
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
}
