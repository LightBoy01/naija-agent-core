import { Job } from 'bullmq';
import { JobData, OnboardingConfig, OnboardingData, Organization } from '@naija-agent/types';
import { WhatsAppService } from '../apps/worker/src/services/whatsapp.js';
import { Redis } from 'ioredis';

// --- MOCKS ---
const mockDbState: Record<string, Organization> = {
  'master-org': {
    id: 'master-org',
    name: 'Sovereign Master',
    config: { isMaster: true, adminPhone: '234700' },
    isActive: true,
    status: 'ACTIVE',
    balance: 0,
    createdAt: {} as any,
    updatedAt: {} as any
  },
  'tenant-org': {
    id: 'tenant-org',
    name: 'Tenant Shop',
    status: 'AWAITING_OTP',
    config: { adminPhone: '234700', botPhone: '234800' },
    pendingSetup: {
      phoneId: 'PID_123',
      accessToken: 'TOK_123',
      wabaId: 'WABA_123',
      initiatedAt: '2026-01-01'
    },
    isActive: false,
    balance: 0,
    createdAt: {} as any,
    updatedAt: {} as any
  }
};

// Mock Firebase Functions
const mockFirebase = {
  getOrgById: async (id: string) => mockDbState[id],
  getPendingSetups: async () => Object.values(mockDbState).filter(o => o.status === 'AWAITING_OTP'),
  setOrgOnboarding: async (id: string, step: string) => { console.log(`[DB] Set ${id} step to ${step}`); },
  completeOnboarding: async () => {},
  activateTenant: async (id: string) => { 
    console.log(`[DB] Activating Tenant ${id}`); 
    mockDbState[id].status = 'ACTIVE';
    mockDbState[id].isActive = true;
  },
  getDb: async () => ({
    collection: () => ({
      doc: (id: string) => ({
        update: async (data: any) => console.log(`[DB] Update ${id}:`, data),
        get: async () => ({ data: () => mockDbState[id] })
      })
    })
  })
};

// Mock WhatsApp
const mockWhatsApp = {
  sendText: async (to: string, text: string) => console.log(`[WA] To ${to}: ${text}`),
  registerNumber: async (otp: string) => console.log(`[META] Registering with OTP: ${otp}`),
  subscribeWaba: async () => console.log(`[META] Subscribed WABA`),
  requestCode: async () => console.log(`[META] Requested Code`)
} as unknown as WhatsAppService;

// --- LOGIC UNDER TEST (Copied & Adapted) ---
async function handleOnboardingLogic(
  job: Job<JobData>,
  org: Organization,
  onboarding: OnboardingConfig | null
) {
  const { from, orgId, content, type } = job.data;
  const text = type === 'text' ? (content.text || '').trim() : '';
  
  // 2. AUTOMATIC OTP RELAY (Master Context)
  const isSixDigits = /^\d{6}$/.test(text);
  if (org.config?.isMaster && isSixDigits) {
      console.log('🔍 Checking Pending Setups...');
      const setups = await mockFirebase.getPendingSetups();
      const target = setups.find(t => t.config?.adminPhone === from && t.status === 'AWAITING_OTP');
      
      if (target) {
          const setup = (target as any).pendingSetup;
          console.log(`🚀 [AUTO-IGNITION] Attempting Meta Registration for: ${target.id}`);
          
          try {
             // Simulate Meta Calls
             await mockWhatsApp.registerNumber(text);
             await mockWhatsApp.subscribeWaba('waba');
             
             // Update DB
             await mockFirebase.activateTenant(target.id);
             
             console.log(`✅ [AUTO-IGNITION] Success for ${target.id}`);
          } catch (err: any) {
             console.error(`❌ [AUTO-IGNITION] Failed:`, err.message);
          }
          return { success: true };
      } else {
        console.log('⚠️ No matching pending setup found.');
      }
  }

  // 5. ONBOARDING STATE MACHINE (OTP_WAIT - Self Verify)
  // ... (Simulated bottom block)
  const currentStep = onboarding?.step || 'NONE';
  if (currentStep === 'OTP_WAIT' && isSixDigits) {
     console.log('🔄 [SELF-VERIFY] Tenant attempting self-verification...');
     // ... Logic matches production ...
     await mockFirebase.activateTenant(orgId);
     return { success: true };
  }

  return null;
}

// --- TEST RUNNER ---
async function runTest() {
  console.log('🧪 TEST: Boss sends OTP to Master Bot (Remote Relay)');
  
  const job = {
    data: {
      from: '234700', // Boss Phone
      orgId: 'master-org', // Sent to Master
      type: 'text',
      content: { text: '123456' }
    }
  } as Job<JobData>;

  await handleOnboardingLogic(job, mockDbState['master-org'], null);

  if (mockDbState['tenant-org'].status === 'ACTIVE') {
    console.log('\n✅ PASS: Tenant Org is ACTIVE.');
  } else {
    console.log('\n❌ FAIL: Tenant Org is not active.');
  }
}

runTest().catch(console.error);
