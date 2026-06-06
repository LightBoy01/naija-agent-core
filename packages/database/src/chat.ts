import { db, getDb } from './db.js';
import { chats, messages, cartItems, products } from './schema.js';
import { eq, desc, sql, and, lt, gt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { Message } from '@naija-agent/types';

/**
 * Finds or creates a chat session in SQL.
 */
export async function findOrCreateChat(orgId: string, userPhone: string, userName: string): Promise<string> {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;

  try {
    const existing = await sqlDb.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    
    if (existing.length === 0) {
      await sqlDb.insert(chats).values({
        id: chatId,
        orgId,
        userPhone,
        userName,
        isOptedOut: false,
        isCartActive: false,
      });
    }
    
    return chatId;
  } catch (e) {
    console.error(`[DB] findOrCreateChat failed for ${chatId}:`, e);
    return chatId; // Return ID anyway, but logs the error
  }
}

/**
 * Saves a message to SQL.
 */
export async function saveMessage(chatId: string, message: Omit<Message, 'timestamp'> & { reasoning?: string }) {
  const sqlDb = getDb();
  const messageId = randomUUID();

  try {
    await sqlDb.transaction(async (tx) => {
      // 1. Insert the message
      await tx.insert(messages).values({
        id: messageId,
        chatId,
        role: message.role,
        content: message.content,
        type: message.type || 'text',
        reasoning: message.reasoning,
        metadata: message.metadata,
      });

      // 2. Update chat metadata (last message, summary)
      await tx.update(chats)
        .set({
          lastMessageAt: sql`CURRENT_TIMESTAMP`,
          summary: message.content.substring(0, 255),
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(chats.id, chatId));
    });
  } catch (e) {
    console.error(`[DB] saveMessage failed for ${chatId}:`, e);
  }
}

/**
 * Retrieves chat history from SQL.
 */
export async function getChatHistory(chatId: string, limit = 10): Promise<Message[]> {
  const sqlDb = getDb();

  try {
    const rows = await sqlDb.select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    
    // Convert SQL rows to Message type expected by workers
    // We reverse it to return oldest first (chronological) as expected by chat histories
    return rows.map(row => ({
      role: row.role as any,
      content: row.content,
      type: row.type as any,
      timestamp: row.createdAt,
      metadata: row.metadata as any,
      reasoning: row.reasoning // Pass through reasoning if it exists
    })).reverse();
  } catch (e) {
    console.error(`[DB] getChatHistory failed for ${chatId}:`, e);
    return [];
  }
}

/**
 * Set opt-out status for a chat.
 */
export async function setOptOut(orgId: string, userPhone: string, status: boolean): Promise<void> {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;
  
  await sqlDb.update(chats)
    .set({ isOptedOut: status, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(chats.id, chatId));
}

/**
 * Check opt-out status.
 */
export async function checkOptOut(orgId: string, userPhone: string): Promise<boolean> {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;
  
  const result = await sqlDb.select({ isOptedOut: chats.isOptedOut })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
    
  return result.length > 0 ? result[0].isOptedOut : false;
}

/**
 * Retrieves a list of recent chats for a specific organization (or all chats if orgId is master).
 */
export async function getNetworkChats(orgId: string, limit = 50): Promise<any[]> {
  const sqlDb = getDb();

  try {
    let rows;
    if (orgId !== 'naija-agent-master') {
      rows = await sqlDb.select().from(chats).where(eq(chats.orgId, orgId)).orderBy(desc(chats.lastMessageAt)).limit(limit);
    } else {
      rows = await sqlDb.select().from(chats).orderBy(desc(chats.lastMessageAt)).limit(limit);
    }
    
    // Normalize to the format expected by the Web Dashboard
    return rows.map(row => ({
      id: row.id,
      orgId: row.orgId,
      whatsappUserId: row.userPhone,
      userName: row.userName,
      summary: row.summary,
      lastMessageAt: row.lastMessageAt,
      isOptedOut: row.isOptedOut,
      isCartActive: row.isCartActive
    }));
  } catch (e) {
    console.error(`[DB] getNetworkChats failed for ${orgId}:`, e);
    return [];
  }
}

// --- COMMERCE / CART WORKFLOWS ---

export async function addToCart(
  orgId: string, 
  userPhone: string, 
  productId: string, 
  quantity: number
): Promise<{ success: boolean; message: string }> {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;

  try {
    return await sqlDb.transaction(async (tx) => {
      // 1. Get Product with Lock
      const productResult = await tx.select({
        stock: products.stock,
        reserved: products.reserved,
        name: products.name,
        price: products.price
      })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .for('update');

      if (productResult.length === 0) return { success: false, message: 'PRODUCT_NOT_FOUND' };
      
      const product = productResult[0];
      const available = product.stock - product.reserved;

      if (available < quantity) {
        return { success: false, message: `INSUFFICIENT_STOCK: Only ${available} units available.` };
      }

      // 2. Reserve Stock
      await tx.update(products)
        .set({ reserved: sql`${products.reserved} + ${quantity}` })
        .where(eq(products.id, productId));

      // 3. Add to Cart Items
      const existingItem = await tx.select()
        .from(cartItems)
        .where(and(eq(cartItems.chatId, chatId), eq(cartItems.productId, productId)))
        .limit(1);
      
      if (existingItem.length > 0) {
        await tx.update(cartItems)
          .set({ quantity: existingItem[0].quantity + quantity })
          .where(eq(cartItems.id, existingItem[0].id));
      } else {
        await tx.insert(cartItems).values({
          id: randomUUID(),
          chatId,
          productId,
          name: product.name,
          price: product.price || '0',
          quantity
        });
      }

      // 4. Update Chat State
      await tx.update(chats)
        .set({ 
          isCartActive: true, 
          lastCartUpdateAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(chats.id, chatId));

      return { success: true, message: 'ADDED' };
    });
  } catch (e: any) {
    console.error('[SQL] addToCart failed:', e.message);
    return { success: false, message: e.message };
  }
}

export async function removeFromCart(
  orgId: string, 
  userPhone: string, 
  productId: string, 
  quantity?: number
): Promise<{ success: boolean; message: string }> {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;

  try {
    return await sqlDb.transaction(async (tx) => {
      const itemResult = await tx.select()
        .from(cartItems)
        .where(and(eq(cartItems.chatId, chatId), eq(cartItems.productId, productId)))
        .limit(1);
      
      if (itemResult.length === 0) return { success: false, message: 'ITEM_NOT_IN_CART' };

      const currentQty = itemResult[0].quantity;
      const removeQty = (quantity && quantity < currentQty) ? quantity : currentQty;

      // 1. Release Reservation
      await tx.update(products)
        .set({ reserved: sql`${products.reserved} - ${removeQty}` })
        .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

      // 2. Update/Delete Cart Item
      if (removeQty === currentQty) {
        await tx.delete(cartItems).where(eq(cartItems.id, itemResult[0].id));
      } else {
        await tx.update(cartItems)
          .set({ quantity: currentQty - removeQty })
          .where(eq(cartItems.id, itemResult[0].id));
      }

      // 3. Check if cart is now empty
      const remaining = await tx.select().from(cartItems).where(eq(cartItems.chatId, chatId)).limit(1);
      if (remaining.length === 0) {
        await tx.update(chats).set({ isCartActive: false }).where(eq(chats.id, chatId));
      }

      return { success: true, message: removeQty === currentQty ? 'REMOVED_ENTIRELY' : 'QUANTITY_REDUCED' };
    });
  } catch (e: any) {
    console.error('[SQL] removeFromCart failed:', e.message);
    return { success: false, message: e.message };
  }
}

export async function getCart(orgId: string, userPhone: string) {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;
  
  const items = await sqlDb.select().from(cartItems).where(eq(cartItems.chatId, chatId));
  
  let totalKobo = 0;
  items.forEach(item => {
    totalKobo += Math.round(parseFloat(item.price) * item.quantity * 100);
  });

  return { items, totalKobo };
}

export async function clearCart(orgId: string, userPhone: string): Promise<void> {
  const sqlDb = getDb();
  const chatId = `${orgId}_${userPhone}`;

  await sqlDb.transaction(async (tx) => {
    const items = await tx.select().from(cartItems).where(eq(cartItems.chatId, chatId));
    
    for (const item of items) {
      await tx.update(products)
        .set({ reserved: sql`${products.reserved} - ${item.quantity}` })
        .where(and(eq(products.id, item.productId), eq(products.orgId, orgId)));
    }

    await tx.delete(cartItems).where(eq(cartItems.chatId, chatId));
    await tx.update(chats).set({ isCartActive: false }).where(eq(chats.id, chatId));
  });
}

export async function getAbandonedCarts(maxAgeMinutes: number = 120, minAgeMinutes: number = 30) {
  const sqlDb = getDb();
  const now = new Date();
  const minAgeTime = new Date(now.getTime() - (minAgeMinutes * 60 * 1000));
  const maxAgeTime = new Date(now.getTime() - (maxAgeMinutes * 60 * 1000));

  try {
      const abandonedChats = await sqlDb.select().from(chats)
        .where(
          and(
            eq(chats.isCartActive, true),
            lt(chats.lastCartUpdateAt, minAgeTime),
            gt(chats.lastCartUpdateAt, maxAgeTime)
          )
        );

      const abandoned: { orgId: string, userPhone: string, chatId: string }[] = [];

      for (const data of abandonedChats) {
        const lastNudge = data.lastNudgeAt ? data.lastNudgeAt.getTime() : 0;
        
        // Nudge Cooldown: Don't nudge if nudged in last 24 hours
        if (now.getTime() - lastNudge > 24 * 60 * 60 * 1000) {
           abandoned.push({
             orgId: data.orgId as string,
             userPhone: data.userPhone as string,
             chatId: data.id
           });
        }
      }

      return abandoned;
  } catch (error) {
      console.error('[SQL] getAbandonedCarts failed', error);
      return [];
  }
}

export async function getExpiredCarts(expirationMinutes: number = 15) {
  const db = getDb();
  const expirationTime = new Date(Date.now() - expirationMinutes * 60 * 1000);
  return await db.select().from(chats)
    .where(
      and(
        eq(chats.isCartActive, true),
        lt(chats.lastCartUpdateAt, expirationTime)
      )
    );
}

export async function markCartNudged(chatId: string) {
  const sqlDb = getDb();
  await sqlDb.update(chats)
    .set({ lastNudgeAt: new Date() })
    .where(eq(chats.id, chatId));
}

export async function syncCartState(chatId: string, isActive: boolean) {
  const sqlDb = getDb();
  await sqlDb.update(chats)
    .set({ 
      isCartActive: isActive, 
      lastCartUpdateAt: isActive ? new Date() : null,
      updatedAt: new Date()
    })
    .where(eq(chats.id, chatId));
}

export async function setAdminAuth(orgId: string, adminPhone: string): Promise<void> {
  const db = getDb();
  const chatId = `${orgId}_${adminPhone}`;
  await db.update(chats)
    .set({ lastAdminAuthAt: new Date() })
    .where(eq(chats.id, chatId));
}

export async function verifyAdminSession(orgId: string, adminPhone: string): Promise<boolean> {
  const db = getDb();
  const chatId = `${orgId}_${adminPhone}`;
  const record = await db.select().from(chats).where(eq(chats.id, chatId));
  if (record.length === 0 || !record[0].lastAdminAuthAt) return false;
  
  const lastAuth = record[0].lastAdminAuthAt.getTime();
  const isExpired = (Date.now() - lastAuth) > 7200000; // 2 hours
  return !isExpired;
}
