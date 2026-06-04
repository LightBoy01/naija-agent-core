import { getDb } from './packages/firebase/dist/index.js';

async function seed() {
    console.log("Connecting to Firebase...");
    const db = getDb();
    
    const orgs = [
        {
            id: '2349015772541',
            name: 'Sidecar 1',
            isActive: true,
            whatsappPhoneId: '2349015772541',
            config: { adminPhone: '2347011925076' }
        },
        {
            id: '2347011925076',
            name: 'Sidecar 2',
            isActive: true,
            whatsappPhoneId: '2347011925076',
            config: { adminPhone: '2349015772541' }
        }
    ];

    for (const org of orgs) {
        console.log(`Seeding ${org.id}...`);
        await db.collection('organizations').doc(org.id).set(org, { merge: true });
    }

    console.log("✅ Seeded successfully.");
    process.exit(0);
}

seed();
