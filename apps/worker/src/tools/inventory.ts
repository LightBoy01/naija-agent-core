import { HandlerContext } from './definitions.js';
import { 
  saveProduct, 
  saveStagingProduct,
  deleteProduct, 
  searchProducts 
} from '@naija-agent/firebase';
import { FieldValue } from 'firebase-admin/firestore';

export async function handleInventoryTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, isVisionContext } = ctx;

  switch (name) {
    case 'save_product':
      if (isVisionContext) {
        await saveStagingProduct(orgId, args.id, {
          name: args.name,
          price: args.price,
          stock: args.stock,
          category: args.category,
          imageUrl: args.imageUrl
        });
        return { status: 'success', code: 'STAGED', product: args.name };
      }

      await saveProduct(orgId, args.id, {
        name: args.name,
        price: args.price,
        stock: args.stock,
        category: args.category,
        imageUrl: args.imageUrl
      });
      return { status: 'success', code: 'SAVED', product: args.name };

    case 'manage_stock': {
      const { decrementStock } = await import('@naija-agent/firebase');
      let finalStock = 0;
      if (args.action === 'set') {
          await saveProduct(orgId, args.productId, { stock: args.amount, lowStockThreshold: args.threshold } as any);
          finalStock = args.amount;
      } else if (args.action === 'add') {
          await saveProduct(orgId, args.productId, { stock: FieldValue.increment(args.amount), lowStockThreshold: args.threshold } as any);
          return { status: 'success', message: `Added ${args.amount} to stock for ${args.productId}.` };
      } else if (args.action === 'reduce') {
          finalStock = await decrementStock(orgId, args.productId, args.amount);
      }
      return { status: 'success', message: `Stock for ${args.productId} is now ${finalStock}.`, stock: finalStock };
    }

    case 'delete_product':
      await deleteProduct(orgId, args.id);
      return { status: 'success', code: 'DELETED' };

    case 'search_products': {
      const products = await searchProducts(orgId, args.query);
      return { status: 'success', data: products };
    }

    default:
      return null;
  }
}
