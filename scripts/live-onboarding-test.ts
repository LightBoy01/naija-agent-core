import { 
  getFirestore, 
  FieldValue 
} from 'firebase-admin/firestore';
import { initializeApp, cert } from 'firebase-admin/app';
import { handleOnboarding } from '../apps/worker/src/handlers/onboarding.js';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.js';
import { Redis } from 'ioredis';
import { JobData, Organization } from '@naija-agent/types';
import { Job } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

// Mock dependencies
const mockRedis = {
  get: async () => null,
  set: async () => 'OK',
  setex: async () => 'OK',
  del: async () => 1
} as unknown as Redis;

const mockWhatsApp = {
  sendText: async (to: string, text: string) => {
    console.log(`\n📱 [MOCK WHATSAPP] To: ${to}\n   "${text}"\n`);
    return 'msg_id_123';
  },
  registerNumber: async (code: string) => {
    console.log(`\n🔗 [MOCK META] Registering number with code: ${code}`);
    return true;
  },
  subscribeWaba: async (wabaId: string) => {
    console.log(`\n🔗 [MOCK META] Subscribing WABA: ${wabaId}`);
    return true;
  },
  addPhoneNumber: async () => ({ phoneId: 'PHONE_ID_123' }),
  requestCode: async () => true
} as unknown as WhatsAppService;

async function runTest() {
  console.log('🚀 Starting Live Onboarding Logic Test...');

  // Initialize Firebase
  let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
  // STRICT SANITIZATION: Keep only printable ASCII (32-126)
  serviceAccountStr = serviceAccountStr.replace(/[^\x20-\x7E]/g, '');
  console.log('DEBUG: First 20 chars:', serviceAccountStr.substring(0, 20));
  
  const serviceAccount = JSON.parse(serviceAccountStr);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  // 1. Setup Test Data
  const masterPhone = process.env.MASTER_ADMIN_PHONE || '2347000000000';
  const tenantPhone = '2348000000000';
  const tenantId = 'test-tenant-' + Date.now();

  console.log(`\n🛠️  Seeding Test Data...`);
  
  // Create Master Org
  await db.collection('organizations').doc('naija-agent-master').set({
    id: 'naija-agent-master',
    name: 'Sovereign Master',
    config: { isMaster: true, adminPhone: masterPhone },
    isActive: true
  });

  // Create Pending Tenant
  await db.collection('organizations').doc(tenantId).set({
    id: tenantId,
    name: 'Test Business Ltd',
    status: 'AWAITING_OTP',
    config: { adminPhone: masterPhone, botPhone: tenantPhone },
    pendingSetup: {
      phoneId: 'PHONE_ID_TEST',
      accessToken: 'MOCK_TOKEN',
      wabaId: 'WABA_ID_TEST',
      initiatedAt: new Date().toISOString()
    }
  });

  console.log(`✅ Seeded Pending Tenant: ${tenantId} (Awaiting OTP)`);

  // 2. Simulate Boss Sending Code to Master Bot
  const job = {
    data: {
      from: masterPhone,
      orgId: 'naija-agent-master', // Message sent TO Master Bot
      type: 'text',
      content: { text: '123456' } // The OTP Code
    }
  } as Job<JobData>;

  const masterOrg = { 
    id: 'naija-agent-master', 
    config: { isMaster: true, adminPhone: masterPhone } 
  } as Organization;

  console.log(`\n📨 Simulating Incoming Message: "123456" to Master Bot...`);
  
  await handleOnboarding(
    job, 
    masterOrg, 
    null, 
    mockWhatsApp, 
    mockRedis
  );

  // 3. Verify Result
  const updatedDoc = await db.collection('organizations').doc(tenantId).get();
  const updatedData = updatedDoc.data();

  console.log(`\n🔍 Verifying Tenant Status...`);
  if (updatedData?.status === 'ACTIVE' && updatedData?.whatsappPhoneId === 'PHONE_ID_TEST') {
    console.log(`✅ TEST PASSED: Tenant ${tenantId} is now ACTIVE!`);
    console.log(`   - Status: ${updatedData.status}`);
    console.log(`   - Phone ID: ${updatedData.whatsappPhoneId}`);
  } else {
    console.error(`❌ TEST FAILED: Tenant status is ${updatedData?.status}`);
    console.log(updatedData);
  }

  // Cleanup
  await db.collection('organizations').doc(tenantId).delete();
  console.log(`\n🧹 Cleanup Done.`);
  process.exit(0);
}

runTest().catch(console.error);
