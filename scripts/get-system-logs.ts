import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Initialize Firebase
const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = getFirestore();

async function getLogs() {
  const orgId = 'naija-agent-master';
  console.log(`📜 --- LATEST SYSTEM LOGS for ${orgId} --- 📜\n`);

  try {
    const logsSnapshot = await db.collection('organizations').doc(orgId).collection('system_logs')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    logsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`[${data.timestamp?.toDate().toLocaleString()}] [${data.eventType}]`);
      console.log(`   Summary: ${data.summary}`);
      if (data.metadata) console.log(`   Metadata: ${JSON.stringify(data.metadata)}`);
      console.log('---');
    });

  } catch (error) {
    console.error('❌ Failed to fetch logs:', error);
  }
}

getLogs();
