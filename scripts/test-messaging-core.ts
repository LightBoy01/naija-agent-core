import dotenv from 'dotenv';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { JobData, SystemConfig } from '@naija-agent/types';
import { handleMessage, MessagingDependencies } from '../apps/worker/src/handlers/messaging.js';
import { getOrgById, getStaff, findOrCreateChat } from '@naija-agent/firebase';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProvider } from '@naija-agent/payments';
import { getTenantTools } from '../apps/worker/src/tools.js';

dotenv.config();

// Mock Services
class MockWhatsAppService extends WhatsAppService {
  constructor() { super('mock-token', 'mock-phone-id'); }
  async sendText(to: string, text: string) {
    console.log(`\n🤖 [BOT REPLY to ${to}]:\n${text}\n`);
    return { messaging_product: 'whatsapp', contacts: [], messages: [{ id: 'mock-msg-id' }] };
  }
}

async function runMessagingTest() {
  console.log('🧪 Starting Core Messaging Workflow Test...');

  // 1. Setup Environment
  const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  
  // Use a known test org or seed one if needed. For now, we use a placeholder ID.
  // In a real run, ensure 'test-org-123' exists in Firestore.
  const testOrgId = 'test-org-123'; 
  const testUserPhone = '2348000000001';

  // 2. Fetch/Mock Context
  // We mock the DB fetch for speed and isolation, or fetch real if integration test.
  // Here we try to fetch real to test the full stack integration.
  let org = await getOrgById(testOrgId);
  
  if (!org) {
     console.log('⚠️ Test Org not found. Creating Mock Org object...');
     org = {
        id: testOrgId,
        name: 'Test Gadget Store',
        whatsappPhoneId: 'mock-phone-id',
        isActive: true,
        balance: 500000,
        currency: { code: 'NGN', symbol: '₦', locale: 'en-NG', rate: 1 },
        config: { model: 'gemini-flash-lite-latest', tools: [] }
     } as any;
  }

  const mockDeps: MessagingDependencies = {
      org,
      isAdmin: false, // Test as Customer
      isStaff: false,
      staffData: null,
      tenantWhatsAppService: new MockWhatsAppService(),
      tenantPaymentProvider: null, // No payments for basic chat
      genAI,
      redisClient: redis,
      tenantTools: getTenantTools(false, false, false, false, org.currency, 'NG')
  };

  // 3. Simulate Incoming Message (Job)
  const jobData: JobData = {
      type: 'text',
      orgId: testOrgId,
      phoneId: 'mock-phone-id',
      from: testUserPhone,
      name: 'Test User',
      messageId: `TEST-${Date.now()}`,
      timestamp: Date.now(),
      content: { text: "Hello, do you have iPhone 15? And how much is it?" }
  };

  // Mock BullMQ Job
  const mockJob = {
      id: 'test-job-1',
      data: jobData,
      attemptsMade: 0,
      opts: { attempts: 3 }
  } as unknown as Job<JobData>;

  try {
      console.log(`👤 [USER]: ${jobData.content.text}`);
      const result = await handleMessage(mockJob, mockDeps);
      
      if (result.success) {
          console.log('✅ Messaging Test PASSED.');
      } else {
          console.error('❌ Messaging Test FAILED:', result.reason);
      }

  } catch (error: any) {
      console.error('❌ FATAL ERROR:', error);
  } finally {
      redis.disconnect();
      process.exit(0);
  }
}

runMessagingTest();
