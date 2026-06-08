
import 'dotenv/config';
import { getDb, chats, messages, users, eq, desc } from '../packages/database/src/index.js';

async function inspectPg() {
    console.log('🐘 --- POSTGRESQL SOVEREIGN INSPECTION --- 🐘');
    try {
        const db = await getDb();
        
        // 1. Inspect Organizations/Users
        const allUsers = await db.select().from(users).limit(5);
        console.log(`\n👤 Total Users (Sample): ${allUsers.length}`);
        allUsers.forEach(u => console.log(` - ${u.phone} (${u.name || 'No Name'}) | Credits: ${u.energyCredits}`));

        // 2. Inspect Chats
        const allChats = await db.select().from(chats).orderBy(desc(chats.updatedAt)).limit(5);
        console.log(`\n💬 Recent Chats: ${allChats.length}`);
        
        for (const chat of allChats) {
            console.log(`\n--- Chat ID: ${chat.id} ---`);
            console.log(`Org: ${chat.orgId} | User: ${chat.userName} (${chat.userPhone})`);
            console.log(`Summary: ${chat.summary}`);
            console.log(`Last Active: ${chat.updatedAt}`);

            // Get last 2 messages for this chat
            const recentMsgs = await db.select()
                .from(messages)
                .where(eq(messages.chatId, chat.id))
                .orderBy(desc(messages.createdAt))
                .limit(2);
            
            recentMsgs.reverse().forEach(m => {
                console.log(` [${m.role.toUpperCase()}] ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`);
            });
        }

    } catch (e: any) {
        console.error('❌ PG Inspection Failed:', e.message);
    }
}

inspectPg().catch(console.error);
