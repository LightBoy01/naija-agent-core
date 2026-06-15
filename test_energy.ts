import { getDb, users, eq } from './packages/database/src/index.js';

async function run() {
    const db = getDb();
    const res = await db.select().from(users).where(eq(users.phone, '2347042310893')).limit(1);
    console.log(res);
    process.exit(0);
}
run().catch(console.error);
