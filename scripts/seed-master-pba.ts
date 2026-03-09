const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// CommonJS equivalent for __dirname in scripts
const scriptDir = __dirname;

const serviceAccountPath = path.join(scriptDir, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function expandMasterBrain() {
  const MASTER_ID = 'naija-agent-master';
  console.log(`🧠 Expanding Brain for: ${MASTER_ID}...`);

  const docsToInject = [
    { key: 'MARKETING_KIT', path: '../docs/MARKETING_KIT.md' },
    { key: 'ONBOARDING_STRATEGY', path: '../docs/ONBOARDING_STRATEGY_2026.md' },
    { key: 'STRATEGIC_VISION', path: '../docs/STRATEGIC_VISION_2026.md' },
    { key: 'PRD', path: '../docs/PRD.md' }
  ];

  const knowledgeRef = db.collection('organizations').doc(MASTER_ID).collection('knowledge');

  for (const doc of docsToInject) {
    const fullPath = path.join(scriptDir, doc.path);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const slug = doc.key.toLowerCase();
      
      await knowledgeRef.doc(slug).set({
        key: doc.key,
        content: content,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Injected ${doc.key} into Master Memory.`);
    } else {
      console.warn(`⚠️ Could not find ${doc.path}`);
    }
  }

  // Update System Prompt to prioritize PBA
  const masterRef = db.collection('organizations').doc(MASTER_ID);
  const newPrompt = `You are the Sovereign COO of Naija Agent. 

[CORE MISSION]: Scale the Naija Agent empire from 5 to 5,000 clients.
[PBA - Project Based Awareness]: You have access to the 'MARKETING_KIT', 'ONBOARDING_STRATEGY', and 'PRD' in your knowledge base. Use these documents strictly for your sales pitch and operations.

[MODE 1: THE BOSS (Admin Phone)]: 
- Talk to the Sovereign as a high-level partner. 
- Use 'get_network_stats' to report on revenue and client growth.
- Use 'create_tenant' to onboard new businesses using the Stage 1 (Acquisition) strategy.

[MODE 2: THE PROSPECT (Stranger Phone)]:
- You are a High-Performance Closer. 
- Goal: Close the deal using the 'Magic Demo' (Voice Notes/Receipts).
- Refer to 'MARKETING_KIT' for specific DM templates and objection handling.
- Pitch the 'Shared App' vs 'Owned App' models correctly according to 'ONBOARDING_STRATEGY'.
- Use 'escalate_to_boss' only for high-value Enterprise leads.

[PIDGIN MODE]: Use professional Nigerian Pidgin where appropriate to build rapport with local business owners.`;

  await masterRef.update({
    systemPrompt: newPrompt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('🚀 MASTER BRAIN EXPANSION COMPLETE. The Bot is now fully aware of the Project Goals.');
  process.exit(0);
}

expandMasterBrain();
