import { eq, and, ilike, sql } from 'drizzle-orm';
import { getDb } from './db.js';
import { products, stagingProducts } from './schema.js';

export async function saveProduct(orgId: string, id: string, data: any): Promise<void> {
  const db = getDb();
  const stock = data.stock ?? 0;
  const lowStockThreshold = data.lowStockThreshold ?? 3;
  const isLowStock = stock <= lowStockThreshold;

  await db.insert(products).values({
    id,
    orgId,
    name: data.name || data.title,
    nameLowercase: (data.name || data.title || '').toLowerCase(),
    description: data.description,
    price: data.price ? String(data.price) : null,
    stock,
    reserved: data.reserved ?? 0,
    lowStockThreshold,
    isLowStock,
    metadata: data,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: products.id,
    set: {
      name: data.name || data.title,
      nameLowercase: (data.name || data.title || '').toLowerCase(),
      description: data.description,
      price: data.price ? String(data.price) : null,
      stock,
      reserved: data.reserved ?? 0,
      lowStockThreshold,
      isLowStock,
      metadata: data,
      updatedAt: new Date()
    }
  });
}

export async function getProducts(orgId: string) {
  const db = getDb();
  return await db.select().from(products).where(eq(products.orgId, orgId));
}

export async function searchProducts(orgId: string, query: string, limit = 5) {
  const db = getDb();
  return await db.select().from(products)
    .where(and(eq(products.orgId, orgId), ilike(products.nameLowercase, `%${query.toLowerCase()}%`)))
    .limit(limit);
}

export async function deleteProduct(orgId: string, productId: string) {
  const db = getDb();
  await db.delete(products).where(and(eq(products.id, productId), eq(products.orgId, orgId)));
}

export async function getLowStockItems(orgId: string) {
  const db = getDb();
  return await db.select().from(products).where(and(eq(products.orgId, orgId), eq(products.isLowStock, true)));
}

// --- STAGING WORKFLOW (BOSS REVIEW) ---

export async function saveStagingProduct(orgId: string, id: string, data: any): Promise<void> {
  const db = getDb();
  await db.insert(stagingProducts).values({
    id,
    orgId,
    name: data.name || data.title,
    nameLowercase: (data.name || data.title || '').toLowerCase(),
    description: data.description,
    price: data.price ? String(data.price) : null,
    stock: data.stock ?? 0,
    metadata: data,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: stagingProducts.id,
    set: {
      name: data.name || data.title,
      nameLowercase: (data.name || data.title || '').toLowerCase(),
      description: data.description,
      price: data.price ? String(data.price) : null,
      stock: data.stock ?? 0,
      metadata: data,
      updatedAt: new Date()
    }
  });
}

export async function getStagingProducts(orgId: string) {
  const db = getDb();
  return await db.select().from(stagingProducts).where(eq(stagingProducts.orgId, orgId));
}

export async function commitStagingProducts(orgId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const staging = await tx.select().from(stagingProducts).where(eq(stagingProducts.orgId, orgId));
    
    for (const item of staging) {
      await saveProduct(orgId, item.id, {
        ...item.metadata as any,
        name: item.name,
        price: item.price,
        stock: item.stock
      });
      await tx.delete(stagingProducts).where(eq(stagingProducts.id, item.id));
    }
  });
}

export async function clearStagingProducts(orgId: string): Promise<void> {
  const db = getDb();
  await db.delete(stagingProducts).where(eq(stagingProducts.orgId, orgId));
}

// --- ATOMIC STOCK LOCKS (PHASE 7.2) ---

export async function reserveStock(orgId: string, items: { productId: string, quantity: number }[]): Promise<boolean> {
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      for (const item of items) {
        const result = await tx.select({
          stock: products.stock,
          reserved: products.reserved,
          name: products.name
        })
        .from(products)
        .where(and(eq(products.id, item.productId), eq(products.orgId, orgId)))
        .for('update');

        if (result.length === 0) throw new Error(`PRODUCT_NOT_FOUND: ${item.productId}`);
        
        const available = result[0].stock - result[0].reserved;
        if (available < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK: Only ${available} units of ${result[0].name} left.`);
        }

        await tx.update(products)
          .set({ reserved: sql`${products.reserved} + ${item.quantity}` })
          .where(eq(products.id, item.productId));
      }
    });
    return true;
  } catch (e: any) {
    console.warn(`[SQL] reserveStock failed for ${orgId}:`, e.message);
    return false;
  }
}

export async function releaseStock(orgId: string, items: { productId: string, quantity: number }[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(products)
        .set({ reserved: sql`${products.reserved} - ${item.quantity}` })
        .where(and(eq(products.id, item.productId), eq(products.orgId, orgId)));
    }
  });
}

export async function finalizeSale(orgId: string, items: { productId: string, quantity: number }[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(products)
        .set({ 
          stock: sql`${products.stock} - ${item.quantity}`,
          reserved: sql`${products.reserved} - ${item.quantity}`,
          updatedAt: new Date()
        })
        .where(and(eq(products.id, item.productId), eq(products.orgId, orgId)));
      
      // Update low stock flag if needed
      const result = await tx.select({ stock: products.stock, threshold: products.lowStockThreshold })
        .from(products)
        .where(eq(products.id, item.productId));
      
      if (result[0]) {
        await tx.update(products)
          .set({ isLowStock: result[0].stock <= result[0].threshold })
          .where(eq(products.id, item.productId));
      }
    }
  });
}
