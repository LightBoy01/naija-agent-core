const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env relative to script
const scriptDir = __dirname;
dotenv.config({ path: path.join(scriptDir, '../.env') });

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
  console.log(`🧠 [EMPIRE ERA] Deep Cleaning & Expanding COO Brain: ${MASTER_ID}...`);

  const knowledgeRef = db.collection('organizations').doc(MASTER_ID).collection('knowledge');

  // 1. CLEANUP: Delete outdated or contradictory facts
  // We use the exact slugs as found in the audit
  const outdatedSlugs = ['gold_rule__credits_', 'platform_architecture', 'custom_bridge__multi_tenancy_'];
  for (const slug of outdatedSlugs) {
     await knowledgeRef.doc(slug).delete();
     console.log(`🗑️ Removed outdated fact slug: ${slug}`);
  }

  // 2. INJECT: New Playbooks
  const docsToInject = [
    { key: 'SOVEREIGN_DIRECTIVE', path: '../docs/SOVEREIGN_DIRECTIVE_2026_03_10.md' },
    { key: 'SETUP_GUIDE', path: '../docs/SETUP_GUIDE.md' },
    { key: 'MARKETING_KIT', path: '../docs/MARKETING_KIT.md' },
    { key: 'ARCHITECTURE', path: '../docs/ARCHITECTURE.md' },
    { key: 'RED_TEAM_REPORT', path: '../docs/RED_TEAM_REPORT.md' },
    { key: 'MASTER_STRATEGY', path: '../docs/MASTER_STRATEGY.md' }
  ];

  for (const doc of docsToInject) {
    const fullPath = path.join(scriptDir, doc.path);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const slug = doc.key.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      await knowledgeRef.doc(slug).set({
        key: doc.key,
        content: content,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Injected ${doc.key} into Master Memory.`);
    }
  }

  // 3. ENFORCE: Imperial Wisdom Facts (Hardcoded Truths)
  const wisdomFacts = [
    { key: 'CREDIT_FEES_2026', content: 'Universal Fees: Text Reply: ₦33. Vision/Receipt Check: ₦77. Visual Response (Product Photos): Flat ₦50. Document PDF: ₦99. All ledgers in Kobo.' },
    { key: 'TRIAL_OFFER', content: 'New Merchants get ₦1,000.00 (100,000 kobo) FREE trial credits on our shared number to see the magic.' },
    { key: 'MASTER_BOT_ID', content: 'I am AZ (Agent Zero), the Sovereign Master Bot. My job is to protect and grow the Empire.' }
  ];

  for (const fact of wisdomFacts) {
    const slug = fact.key.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await knowledgeRef.doc(slug).set({
      ...fact,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`👑 Enforced Wisdom: ${fact.key}`);
  }

  console.log('🚀 MASTER BRAIN PURIFIED & SYNCHRONIZED.');
  process.exit(0);
}

expandMasterBrain();
