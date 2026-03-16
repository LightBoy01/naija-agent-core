'use server';

import { verifyTenantSession } from '../../../../lib/auth';
import { saveProduct, deleteProduct } from '@naija-agent/firebase';
import { revalidatePath } from 'next/cache';

/**
 * UPDATES A PRODUCT'S PRICE OR STOCK
 */
export async function updateProductAction(orgId: string, productId: string, data: {
  price?: number;
  stock?: number;
  lowStockThreshold?: number;
}) {
  await verifyTenantSession(orgId);

  try {
    await saveProduct(orgId, productId, data);
    revalidatePath(`/dashboard/${orgId}/inventory`);
    return { success: true };
  } catch (e: unknown) {
    const error = e as Error;
    return { success: false, error: error.message };
  }
}

/**
 * REMOVES A PRODUCT FROM THE CATALOG
 */
export async function removeProductAction(orgId: string, productId: string) {
  await verifyTenantSession(orgId);

  try {
    await deleteProduct(orgId, productId);
    revalidatePath(`/dashboard/${orgId}/inventory`);
    return { success: true };
  } catch (e: unknown) {
    const error = e as Error;
    return { success: false, error: error.message };
  }
}

/**
 * CREATES A NEW PRODUCT
 */
export async function createProductAction(orgId: string, data: {
  name: string;
  price: number;
  stock: number;
  category?: string;
}) {
  await verifyTenantSession(orgId);

  try {
    // Generate a clean slug + random suffix for ID
    const productId = data.name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20) + '_' + Math.random().toString(36).substring(2, 7);
    await saveProduct(orgId, productId, data);
    revalidatePath(`/dashboard/${orgId}/inventory`);
    return { success: true };
  } catch (e: unknown) {
    const error = e as Error;
    return { success: false, error: error.message };
  }
}
