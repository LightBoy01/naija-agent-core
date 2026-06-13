import { Type } from '@google/genai';
import { HandlerContext } from './definitions.js';

export const INVENTORY_TOOLS = [
  {
    name: "save_product",
    description: "Updates business facts or prices. (Requires Boss Auth)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: "Key name" },
        content: { type: Type.STRING, description: "Details/Price" },
        imageUrl: { type: Type.STRING, description: "Product Image URL" }
      },
      required: ["key", "content"]
    }
  },
  {
    name: "delete_product",
    description: "Deletes obsolete business knowledge. (Requires Boss Auth)",
    parameters: {
      type: Type.OBJECT,
      properties: { key: { type: Type.STRING, description: "Key to delete" } },
      required: ["key"]
    }
  },
  {
    name: "manage_stock",
    description: "Updates the stock level for a product. (Manager Only)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: "Unique ID (sku)" },
        action: { type: Type.STRING, format: "enum", enum: ['add', 'set', 'reduce'], description: "Action to take" },
        amount: { type: Type.NUMBER, description: "Quantity" },
        threshold: { type: Type.NUMBER, description: "Optional: Set new low-stock alert threshold" }
      },
      required: ["productId", "action", "amount"]
    }
  },
  {
    name: "search_products",
    description: "Searches for products in the catalog by name.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "Search term" } },
      required: ["query"]
    }
  },
  {
    name: "send_product_image",
    description: "Sends a product image directly to the customer's WhatsApp. Use this to show a product after finding its imageUrl.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        imageUrl: { type: Type.STRING, description: "The persistent image URL of the product." },
        caption: { type: Type.STRING, description: "Optional description or price to include with the image." }
      },
      required: ["imageUrl"]
    }
  }
];

import { 
  saveProduct, 
  saveStagingProduct,
  deleteProduct, 
  searchProducts 
} from '@naija-agent/firebase';
import { FieldValue } from 'firebase-admin/firestore';

export async function handleInventoryTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, isVisionContext, from, whatsappService } = ctx;

  switch (name) {
    case 'save_product':
      if (isVisionContext) {
          // If in vision context, we are likely confirming a "detected" product
          await saveProduct(orgId, args.key, {
              content: args.content,
              imageUrl: args.imageUrl,
              updatedAt: FieldValue.serverTimestamp()
          });
      } else {
          await saveProduct(orgId, args.key, {
              content: args.content,
              imageUrl: args.imageUrl,
              updatedAt: FieldValue.serverTimestamp()
          });
      }
      return { status: 'success', message: `Product ${args.key} saved.` };

    case 'manage_stock': {
        const { getDb } = await import('@naija-agent/firebase');
        const db = getDb();
        const productRef = db.collection('organizations').doc(orgId).collection('products').doc(args.productId);
        
        let updateData: any = {};
        if (args.action === 'add') updateData.stock = FieldValue.increment(args.amount);
        else if (args.action === 'reduce') updateData.stock = FieldValue.increment(-args.amount);
        else if (args.action === 'set') updateData.stock = args.amount;
        
        if (args.threshold !== undefined) updateData.lowStockThreshold = args.threshold;
        
        await productRef.update(updateData);
        return { status: 'success', message: `Stock for ${args.productId} updated.` };
    }

    case 'delete_product':
      await deleteProduct(orgId, args.key);
      return { status: 'success', message: `Product ${args.key} deleted.` };

    case 'search_products': {
        const results = await searchProducts(orgId, args.query);
        return { status: 'success', products: results };
    }

    case 'send_product_image': {
        try {
            await whatsappService.sendImage(from, args.imageUrl, args.caption);
            return { status: 'success', message: 'Image sent successfully to customer.' };
        } catch (e: any) {
            return { status: 'error', message: `Failed to send image: ${e.message}` };
        }
    }

    default:
      throw new Error(`Unknown inventory tool: ${name}`);
  }
}
