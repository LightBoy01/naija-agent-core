import { getDb } from './packages/firebase/dist/index.js';

async function remap() {
    console.log("Connecting to Firebase...");
    const db = getDb();
    
    // Masterbot Admin's Number
    const MASTER_ADMIN_PHONE = "2347042310893"; // Or +2347042310893 depending on format, but typically without + in this system.

    // 1. Map Aelixxr (Life OS)
    await db.collection('organizations').doc('aelixxr').set({
        name: 'Aelixxr OS',
        isActive: true,
        whatsappPhoneId: '2349015772541',
        config: { 
            botPhone: '2349015772541',
            adminPhone: MASTER_ADMIN_PHONE, 
            isMaster: true 
        }
    }, { merge: true });

    await db.collection('organizations').doc('naija-agent-master').set({
        name: 'Master Tenant',
        isActive: true,
        whatsappPhoneId: '1034379023092936',
        config: { 
            botPhone: '1034379023092936',
            adminPhone: MASTER_ADMIN_PHONE,
            isMaster: true 
        }
    }, { merge: true });

    // 2. Map Zynux (Business OS)
    await db.collection('organizations').doc('zynux').set({
        name: 'Zynux Business',
        isActive: true,
        whatsappPhoneId: '2347011925076',
        config: { 
            botPhone: '2347011925076',
            adminPhone: MASTER_ADMIN_PHONE,
            isMaster: true // If it acts as masterbot for other client bots
        }
    }, { merge: true });

    // 3. Clean up the literal phone number documents I incorrectly created earlier
    await db.collection('organizations').doc('2349015772541').delete();
    await db.collection('organizations').doc('2347011925076').delete();

    console.log("✅ Successfully mapped roles correctly!");
    process.exit(0);
}

remap().catch(console.error);
