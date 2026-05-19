import { getDb } from '../packages/firebase/src/index.js';

async function main() {
    try {
        const db = getDb();
        const chatsSnapshot = await db.collection('chats').limit(2).get();
        
        for (const doc of chatsSnapshot.docs) {
            console.log(`Chat ID: ${doc.id}`);
            console.log('Chat Data:', doc.data());
            
            const messagesSnapshot = await doc.ref.collection('messages').orderBy('timestamp', 'desc').limit(2).get();
            for (const msgDoc of messagesSnapshot.docs) {
                console.log(`  Message ID: ${msgDoc.id}`);
                console.log('  Message Data:', msgDoc.data());
            }
        }
    } catch (err: any) {
        console.error('❌ Error inspecting chats:', err.message);
    }
}

main();