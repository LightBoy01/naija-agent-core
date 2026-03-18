import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ serviceAccountKey.json not found!');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();
const MASTER_ORG_ID = 'naija-agent-master';

async function seedWisdom() {
  console.log(`🧠 [WISDOM SEEDING] Aligning Master Bot with Sovereign Directives...`);

  try {
    const docsDir = path.join(__dirname, '../docs');
    const filesToSeed = [
      { key: 'EMPIRE_CORE', file: 'EMPIRE_CORE.md' },
      { key: 'EMPIRE_ROADMAP', file: 'EMPIRE_ROADMAP.md' },
      { key: 'ARCHITECTURE', file: 'ARCHITECTURE.md' },
      { key: 'PHASE_8_ROADMAP', file: 'PHASE_8_ROADMAP.md' },
      { key: 'RED_TEAM_REPORT', file: 'RED_TEAM_REPORT_PHASE_7_3.md' },
      { key: 'TECHNICAL_HERITAGE', file: 'TECHNICAL_HERITAGE.md' },
      { key: 'WORKFLOW_TESTING_PLAN', file: 'WORKFLOW_TESTING_PLAN.md' }
    ];

    for (const item of filesToSeed) {
      const filePath = path.join(docsDir, item.file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Save to Knowledge Collection
        await db.collection('organizations')
          .doc(MASTER_ORG_ID)
          .collection('knowledge')
          .doc(item.key)
          .set({
            key: item.key,
            content: content,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
        console.log(`✅ Seeded: ${item.file} -> Knowledge Base`);
      } else {
        console.warn(`⚠️ File not found: ${item.file}`);
      }
    }

    // Special: Update the Master Bot's System Prompt to explicitly mention these docs
    await db.collection('organizations').doc(MASTER_ORG_ID).update({
      systemPrompt: `You are the Sovereign Master Bot of the Naija Agent Network. 
      
      [WISDOM BASE]:
      You have access to 'EMPIRE_CORE', 'EMPIRE_ROADMAP', 'ARCHITECTURE', 'PHASE_8_ROADMAP', 'RED_TEAM_REPORT', 'TECHNICAL_HERITAGE', and 'WORKFLOW_TESTING_PLAN' in your knowledge base. Use them to answer questions about the platform's vision, pricing, and technical setup.
      
      [IDENTITY]:
      1. If the user is the Oga Boss (2347042310893), you are the Sovereign COO. Use 'get_network_stats', 'audit_tenant', and 'broadcast_to_bosses'.
      2. If they are a random lead, you are the Onboarding Specialist. Use 'register_trial_interest' to give them a ₦1,000 trial.
      
      Be sharp, loyal, and focus on expanding the Empire.`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('\n👑 [SUCCESS] Master Bot is now fully informed and aligned.');
  } catch (error: any) {
    console.error('❌ Education failed:', error.message);
  } finally {
    process.exit(0);
  }
}

seedWisdom();
