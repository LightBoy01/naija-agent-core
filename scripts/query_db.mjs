import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    await client.connect();
    
    console.log('--- LATEST ZYNUX CHATS ---');
    const zynuxChats = await client.query(`SELECT id, user_phone, user_name FROM chats WHERE org_id = 'zynux' ORDER BY created_at DESC LIMIT 2`);
    console.log(zynuxChats.rows);

    for (const chat of zynuxChats.rows) {
      console.log(`\n--- LATEST MESSAGES FOR ZYNUX CHAT ${chat.id} ---`);
      const msgs = await client.query(`SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 3`, [chat.id]);
      console.log(msgs.rows);
    }

    console.log('\n--- LATEST AELIXXR CHATS ---');
    const aelixxrChats = await client.query(`SELECT id, user_phone, user_name FROM chats WHERE org_id = 'aelixxr-life-companion' OR org_id = 'aelixxr' ORDER BY created_at DESC LIMIT 2`);
    console.log(aelixxrChats.rows);

    for (const chat of aelixxrChats.rows) {
      console.log(`\n--- LATEST MESSAGES FOR AELIXXR CHAT ${chat.id} ---`);
      const msgs = await client.query(`SELECT role, content FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 3`, [chat.id]);
      console.log(msgs.rows);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}
run();
