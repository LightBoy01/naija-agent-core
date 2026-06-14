import { getDb as getFirestore } from './packages/firebase/dist/index.js';
import { db as sql, organizations, chats, messages, knowledge } from './packages/database/dist/index.js';
import dotenv from 'dotenv';
dotenv.config();
// Override DATABASE_URL to use the SSH tunnel
process.env.DATABASE_URL = 'postgresql://naija_admin:sovereign_pass@127.0.0.1:5432/naija_ledger';
async function restore() {
    const firestore = getFirestore();
    const sqlDb = sql;
    if (!sqlDb) {
        console.error('SQL Database not initialized.');
        return;
    }
    const targetOrgs = ['aelixxr', 'aelixxr-life-companion'];
    for (const orgId of targetOrgs) {
        console.log(`Restoring org: ${orgId}`);
        const doc = await firestore.collection('organizations').doc(orgId).get();
        if (!doc.exists) {
            console.log(`Org ${orgId} not found in Firestore.`);
            continue;
        }
        const data = doc.data();
        await sqlDb.insert(organizations).values({
            id: doc.id,
            name: data.name || 'Unknown Org',
            balanceKobo: data.balance || 0,
            isActive: data.isActive !== false,
            status: data.status || 'ACTIVE',
            region: data.region || 'NG',
            sector: data.sector || 'commerce',
            deploymentModel: data.deploymentModel || 'SHARED',
            costPerReply: data.costPerReply || 3300,
            whatsappPhoneId: data.whatsappPhoneId || null,
            timezone: data.timezone || 'Africa/Lagos',
            onboardingStep: data.onboardingStep || 'COMPLETE',
            onboardingData: data.onboardingData || null,
            systemPrompt: data.systemPrompt || null,
            config: data.config || {},
            trialStartedAt: data.trialStartedAt?.toDate() || null,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
        }).onConflictDoNothing();
        // restore knowledge
        const knowledgeSnap = await firestore.collection('organizations').doc(doc.id).collection('knowledge').get();
        for (const kDoc of knowledgeSnap.docs) {
            const kData = kDoc.data();
            await sqlDb.insert(knowledge).values({
                slug: kDoc.id,
                orgId: doc.id,
                key: kData.key,
                content: kData.content,
                imageUrl: kData.imageUrl || null,
                updatedAt: kData.updatedAt?.toDate() || new Date()
            }).onConflictDoNothing();
        }
        console.log(`Restored org basic data + knowledge for ${orgId}`);
    }
    // Restore chats
    console.log('Restoring chats for target orgs...');
    const chatsSnapshot = await firestore.collection('chats').get();
    for (const doc of chatsSnapshot.docs) {
        const data = doc.data();
        if (!targetOrgs.includes(data.organizationId))
            continue;
        await sqlDb.insert(chats).values({
            id: doc.id,
            orgId: data.organizationId || null,
            userPhone: data.whatsappUserId || null,
            userName: data.userName || null,
            isOptedOut: data.isOptedOut || false,
            isCartActive: data.isCartActive || false,
            lastCartUpdateAt: data.lastCartUpdateAt?.toDate() || null,
            lastAdminAuthAt: data.lastAdminAuthAt?.toDate() || null,
            lastNudgeAt: data.lastNudgeAt?.toDate() || null,
            lastMessageAt: data.lastMessageAt?.toDate() || null,
            summary: data.summary || null,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
        }).onConflictDoNothing();
        // Messages
        const msgSnap = await firestore.collection('chats').doc(doc.id).collection('messages')
            .orderBy('timestamp', 'desc').limit(5000).get();
        for (const mDoc of msgSnap.docs) {
            const mData = mDoc.data();
            await sqlDb.insert(messages).values({
                id: mDoc.id,
                chatId: doc.id,
                role: mData.role || 'user',
                content: mData.content || '',
                type: mData.type || 'text',
                tokenCount: mData.tokenCount || 0,
                createdAt: mData.timestamp?.toDate() || new Date()
            }).onConflictDoNothing();
        }
    }
    console.log('Restore complete!');
    process.exit(0);
}
restore().catch(console.error);
