import { Type } from '@google/genai';
import { HandlerContext } from './definitions.js';

export const INVENTORY_TOOLS = [
  {
    name: "bulk_save_products",
    description: "Updates or adds multiple business facts or prices at once. (Requires Boss Auth)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        products: {
          type: Type.ARRAY,
          description: "List of products to save",
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING, description: "Key name" },
              content: { type: Type.STRING, description: "Details/Price" },
              imageUrl: { type: Type.STRING, description: "Product Image URL" }
            },
            required: ["key", "content"]
          }
        }
      },
      required: ["products"]
    }
  },
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
} from '@naija-agent/database';
import { FieldValue } from 'firebase-admin/firestore';

export async function handleInventoryTools(name: string, args: any, ctx: HandlerContext): Promise<any> {
  const { orgId, isVisionContext, from, whatsappService } = ctx;

  switch (name) {
    case 'bulk_save_products': {
      let savedCount = 0;
      for (const prod of args.products) {
          if (isVisionContext) {
              await saveProduct(orgId, prod.key, {
                  name: prod.key,
                  description: prod.content,
                  metadata: { imageUrl: prod.imageUrl || null }
              });
          } else {
              await saveProduct(orgId, prod.key, {
                  name: prod.key,
                  description: prod.content,
                  metadata: { imageUrl: prod.imageUrl || null }
              });
          }
          savedCount++;
      }
      return { status: 'success', message: `${savedCount} products bulk saved.` };
    }

    case 'save_product':
      if (isVisionContext) {
          await saveProduct(orgId, args.key, {
              name: args.key,
              description: args.content,
              metadata: { imageUrl: args.imageUrl || null }
          });
      } else {
          await saveProduct(orgId, args.key, {
              name: args.key,
              description: args.content,
              metadata: { imageUrl: args.imageUrl || null }
          });
      }
      return { status: 'success', message: `Product ${args.key} saved.` };

    case 'manage_stock': {
        const { getDb, schema } = await import('@naija-agent/database');
        const { eq, and, sql } = await import('drizzle-orm');
        const db = getDb();
        
        let stockUpdate;
        if (args.action === 'add') stockUpdate = sql`${schema.products.stock} + ${args.amount}`;
        else if (args.action === 'reduce') stockUpdate = sql`${schema.products.stock} - ${args.amount}`;
        else if (args.action === 'set') stockUpdate = args.amount;
        
        const updateData: any = { stock: stockUpdate };
        if (args.threshold !== undefined) updateData.lowStockThreshold = args.threshold;
        
        await db.update(schema.products)
            .set(updateData)
            .where(and(eq(schema.products.id, args.productId), eq(schema.products.orgId, orgId)));
            
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
