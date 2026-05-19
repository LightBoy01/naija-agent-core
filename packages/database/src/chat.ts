import { db, getDb } from './db.js';
import { chats, messages } from './schema.js';
import { eq, desc, sql } from 'drizzle-orm';
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
    const query = sqlDb.select()
      .from(chats)
      .orderBy(desc(chats.lastMessageAt))
      .limit(limit);
    
    if (orgId !== 'naija-agent-master') {
      query.where(eq(chats.orgId, orgId));
    }

    const rows = await query;
    
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

export async function getAbandonedCarts(maxAgeMinutes: number = 120, minAgeMinutes: number = 30) {
  const sqlDb = getDb();
  const now = Date.now();
  const minAgeTime = new Date(now - (minAgeMinutes * 60 * 1000));
  const maxAgeTime = new Date(now - (maxAgeMinutes * 60 * 1000));

  // We can't do direct date inequalities easily with drizzle mapped helpers without sql`...`, so we'll use raw SQL snippets.
  try {
      const abandonedChats = await sqlDb.select().from(chats)
        .where(
          sql`${chats.isCartActive} = 1 AND 
              ${chats.lastCartUpdateAt} <= ${minAgeTime} AND 
              ${chats.lastCartUpdateAt} >= ${maxAgeTime}`
        );

      const abandoned: { orgId: string, userPhone: string, chatId: string }[] = [];

      for (const data of abandonedChats) {
        const lastNudge = data.lastNudgeAt ? data.lastNudgeAt.getTime() : 0;
        
        // Nudge Cooldown: Don't nudge if nudged in last 24 hours
        if (now - lastNudge > 24 * 60 * 60 * 1000) {
           abandoned.push({
             orgId: data.orgId as string,
             userPhone: data.userPhone as string,
             chatId: data.id
           });
        }
      }

      return abandoned;
  } catch (error) {
      console.error('[DB] getAbandonedCarts failed', error);
      return [];
  }
}

export async function markCartNudged(chatId: string) {
  const sqlDb = getDb();
  await sqlDb.update(chats)
    .set({ lastNudgeAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(chats.id, chatId));
}

/**
 * Syncs the active cart state from Firebase to SQL to ensure reminders work.
 */
export async function syncCartState(chatId: string, isActive: boolean) {
  const sqlDb = getDb();
  await sqlDb.update(chats)
    .set({ 
      isCartActive: isActive, 
      lastCartUpdateAt: isActive ? sql`CURRENT_TIMESTAMP` : null,
      updatedAt: sql`CURRENT_TIMESTAMP`
    })
    .where(eq(chats.id, chatId));
}

