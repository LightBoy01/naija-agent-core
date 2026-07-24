import { getDb } from './packages/firebase/dist/index.js';

async function remap() {
    console.log("Connecting to Firebase...");
    const db = getDb();
    
    // Map Aelixxr
    await db.collection('organizations').doc('aelixxr').set({
        name: 'Aelixxr Masterbot',
        isActive: true,
        whatsappPhoneId: '2347011925076',
        config: { 
            botPhone: '2347011925076',
            adminPhone: '2347072139935', // Recognizes Zynux phone as admin
            isMaster: true 
        }
    }, { merge: true });

    // Ensure naija-agent-master is also mapped if needed
    await db.collection('organizations').doc('naija-agent-master').set({
        name: 'Master Tenant',
        isActive: true,
        whatsappPhoneId: '2347011925076',
        config: { 
            botPhone: '2347011925076',
            adminPhone: '2347072139935',
            isMaster: true 
        }
    }, { merge: true });

    // Map Zynux (using the bot's number as orgId for client bots)
    await db.collection('organizations').doc('2347072139935').set({
        name: 'Zynux Client Bot',
        isActive: true,
        whatsappPhoneId: '2347072139935',
        config: { 
            botPhone: '2347072139935',
            adminPhone: '2347011925076' // Recognizes Aelixxr phone as admin
        }
    }, { merge: true });

    // Delete the incorrect Sidecar 2 document we accidentally created earlier
    await db.collection('organizations').doc('2347011925076').delete();

    console.log("✅ Successfully mapped roles!");
    process.exit(0);
}

remap().catch(console.error);
