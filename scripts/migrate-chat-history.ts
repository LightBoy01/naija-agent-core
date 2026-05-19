import { getDb as getFirestore } from '../packages/firebase/src/index.js';
import { getDb, chats as sqlChats, messages as sqlMessages, organizations } from '../packages/database/src/index.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

async function migrate() {
    console.log('🚀 Starting Chat History Migration (Firestore -> TiDB)...');
    
    const db = getFirestore();
    const sqlDb = getDb();
    
    try {
        const chatsSnapshot = await db.collection('chats').get();
        console.log(`📂 Found ${chatsSnapshot.size} chats in Firestore.`);
        
        let totalMessagesMigrated = 0;
        
        for (const chatDoc of chatsSnapshot.docs) {
            const chatData = chatDoc.data();
            const chatId = chatDoc.id;
            
            console.log(`🔄 Migrating chat: ${chatId}...`);
            
            // Validate OrgId to prevent foreign key errors
            let validOrgId: string | null = chatData.organizationId || null;
            if (validOrgId) {
                const orgExists = await sqlDb.select().from(organizations).where(eq(organizations.id, validOrgId)).limit(1);
                if (orgExists.length === 0) {
                    console.warn(`  ⚠️ Org ${validOrgId} missing in TiDB. Nulling org_id for chat ${chatId}`);
                    validOrgId = null;
                }
            }

            // 1. Create chat record in TiDB
            const existingChat = await sqlDb.select().from(sqlChats).where(eq(sqlChats.id, chatId)).limit(1);
            if (existingChat.length === 0) {
                await sqlDb.insert(sqlChats).values({
                    id: chatId,
                    orgId: validOrgId,
                    userPhone: chatData.whatsappUserId || null,
                    userName: chatData.userName || 'User',
                    isOptedOut: chatData.isOptedOut || false,
                    isCartActive: chatData.isCartActive || false,
                    lastMessageAt: chatData.lastMessageAt ? new Date(chatData.lastMessageAt._seconds * 1000) : null,
                    summary: chatData.summary || null,
                    createdAt: chatData.createdAt ? new Date(chatData.createdAt._seconds * 1000) : new Date(),
                    updatedAt: chatData.updatedAt ? new Date(chatData.updatedAt._seconds * 1000) : new Date(),
                });
            }
            
            // 2. Fetch messages for this chat
            const messagesSnapshot = await chatDoc.ref.collection('messages').orderBy('timestamp', 'asc').get();
            console.log(`  └─ Found ${messagesSnapshot.size} messages.`);
            
            if (messagesSnapshot.size > 0) {
                // Batch insert messages
                const messagesToInsert = messagesSnapshot.docs.map(msgDoc => {
                    const msgData = msgDoc.data();
                    return {
                        id: randomUUID(),
                        chatId: chatId,
                        role: msgData.role,
                        content: msgData.content,
                        type: msgData.type || 'text',
                        reasoning: msgData.reasoning || null,
                        metadata: msgData.metadata || null,
                        createdAt: msgData.timestamp ? new Date(msgData.timestamp._seconds * 1000) : new Date(),
                    };
                });
                
                // TiDB might have limits on batch size, but usually 100-500 is safe.
                // We'll insert all since chat history per user is usually small.
                await sqlDb.insert(sqlMessages).values(messagesToInsert);
                totalMessagesMigrated += messagesToInsert.length;
            }
        }
        
        console.log(`\n✅ Migration Complete!`);
        console.log(`📊 Total Chats Processed: ${chatsSnapshot.size}`);
        console.log(`📊 Total Messages Migrated: ${totalMessagesMigrated}`);
        
    } catch (err: any) {
        console.error('❌ Migration Failed:', err.message);
    }
}

migrate().then(() => process.exit(0));