import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { handleMessage } from '../apps/worker/src/handlers/messaging';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Redis } from 'ioredis';
import { getTenantTools } from '../apps/worker/src/tools';

dotenv.config();

// Mocks
const mockRedis = {
  get: async () => null,
  set: async () => 'OK',
  incr: async () => 1,
  expire: async () => 1,
  lpush: async () => 1,
  ltrim: async () => 'OK',
  lrange: async () => [],
} as any;

const mockWhatsApp = {
  sendText: async (to: string, msg: string) => console.log(`[WhatsApp] To ${to}: ${msg}`),
  downloadMedia: async () => ({ buffer: Buffer.from(''), mimeType: 'image/jpeg' }),
  sendImage: async () => console.log('[WhatsApp] Sent Image')
} as any;

const mockGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function runDebug() {
  // Init Firebase
  const serviceAccountPath = path.join(__dirname, '../packages/firebase/serviceAccountKey.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = getFirestore();
  const orgId = 'naija-agent-master';
  
  // Fetch Org Data to simulate real worker flow
  const orgDoc = await db.collection('organizations').doc(orgId).get();
  if (!orgDoc.exists) {
      console.error('❌ Master Org not found!');
      return;
  }
  const org = { id: orgDoc.id, ...orgDoc.data() } as any;

  console.log(`🔍 Debugging Knowledge for Org: ${org.name} (${org.id})`);

  const job = {
    data: {
      from: process.env.MASTER_ADMIN_PHONE || '2347042310893',
      orgId: org.id,
      content: { text: "What is in the Red Team Report?" },
      type: 'text',
      messageId: 'debug-123'
    }
  } as any;

  const deps = {
    org,
    isAdmin: true, // Simulate Boss
    isStaff: false,
    staffData: null,
    tenantWhatsAppService: mockWhatsApp,
    tenantPaymentProvider: null,
    genAI: mockGenAI,
    redisClient: mockRedis,
    tenantTools: getTenantTools(true, false, true, false)
  };

  try {
    await handleMessage(job, deps);
  } catch (e) {
    console.error('Error:', e);
  }
}

runDebug();