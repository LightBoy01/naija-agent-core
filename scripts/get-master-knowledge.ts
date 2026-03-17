import { getAllKnowledge } from './packages/firebase/src/modules/content.ts';
import { initializeApp, cert, getApp } from 'firebase-admin/app';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase
const serviceAccountPath = './packages/firebase/serviceAccountKey.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

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
    const knowledge = await getAllKnowledge(MASTER_ORG_ID);
    console.log(JSON.stringify(knowledge, null, 2));
  } catch (error) {
    console.error('❌ Failed to fetch knowledge:', error);
  }
}

getMasterKnowledge();
