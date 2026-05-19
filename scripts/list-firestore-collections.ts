import { getDb } from '../packages/firebase/src/index.js';

async function main() {
    try {
        const db = getDb();
        const collections = await db.listCollections();
        console.log('Firestore Collections:', collections.map(c => c.id));
    } catch (err: any) {
        console.error('❌ Error listing collections:', err.message);
    }
}

main();