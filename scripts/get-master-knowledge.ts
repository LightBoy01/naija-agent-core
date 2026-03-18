import { initializeApp, cert, getApp } from 'firebase-admin/app';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase
const serviceAccountPath = path.resolve(__dirname, '../packages/firebase/serviceAccountKey.json');
let serviceAccount;

try {
  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error('❌ Failed to load service account key:', error);
  process.exit(1);
}

try {
  getApp();
} catch (e) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

async function getMasterKnowledge() {
  const MASTER_ORG_ID = 'naija-agent-master';
  console.log(`🧠 Fetching knowledge for Master Bot (${MASTER_ORG_ID})...`);

  try {
    // Dynamic import to ensure Firebase is initialized first
    const { getAllKnowledge } = await import('../packages/firebase/src/modules/content.ts');
    const knowledge = await getAllKnowledge(MASTER_ORG_ID);
    console.log(JSON.stringify(knowledge, null, 2));
  } catch (error) {
    console.error('❌ Failed to fetch knowledge:', error);
  }
}

getMasterKnowledge();
