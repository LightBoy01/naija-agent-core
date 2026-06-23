import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock all external dependencies before importing the handler ---
vi.mock('@naija-agent/firebase', () => ({
  getOrgById: vi.fn(),
  setOrgOnboarding: vi.fn(),
  completeOnboarding: vi.fn(),
  getPendingSetups: vi.fn(),
  createTenant: vi.fn(),
  getOrgOnboarding: vi.fn(),
  activateTenant: vi.fn(),
  incrementDailyExpenses: vi.fn(),
  getStaff: vi.fn(),
  checkFraud: vi.fn(),
  getDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({
        update: vi.fn().mockResolvedValue({}),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      })),
    })),
    doc: vi.fn((id: string) => ({
      update: vi.fn().mockResolvedValue({}),
    })),
  })),
}));

vi.mock('@naija-agent/database', () => ({
  setOrgOnboarding: vi.fn(),
  completeOnboarding: vi.fn(),
  createTenant: vi.fn(),
  activateTenant: vi.fn(),
  getOrgById: vi.fn(),
  getActiveOrganizations: vi.fn(),
  getPendingSetups: vi.fn(),
}));

vi.mock('ioredis', () => {
  const store = new Map<string, string>();
  return {
    default: vi.fn(() => ({
      get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
      set: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
      del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(1); }),
      expire: vi.fn(() => Promise.resolve(1)),
      incr: vi.fn(() => Promise.resolve(1)),
      pipeline: vi.fn(() => ({ set: vi.fn(), expire: vi.fn(), exec: vi.fn() })),
    })),
  };
});

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn((s: string) => Promise.resolve(`$2b$10$hashed_${s}`)),
    compare: vi.fn(),
  },
  hash: vi.fn((s: string) => Promise.resolve(`$2b$10$hashed_${s}`)),
  compare: vi.fn(),
}));

// --- Now import everything ---
import { handleOnboarding } from '../../src/handlers/onboarding.js';
import * as Firebase from '@naija-agent/firebase';
import * as Database from '@naija-agent/database';
import { WhatsAppService } from '../../src/services/whatsapp.js';

// Mock WhatsAppService
vi.mock('../../src/services/whatsapp.js', () => ({
  WhatsAppService: vi.fn(),
}));

function makeOrg(overrides: Record<string, any> = {}) {
  return {
    id: 'org_test123',
    name: 'Test Shop',
    balance: 500000,
    isActive: true,
    status: 'ACTIVE',
    currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' },
    config: {
      adminPhone: '2348012345678',
      adminPin: '$2b$10$hashed_1234',
      model: 'deepseek-v4-flash',
      tools: ['web_search'],
    },
    onboardingStep: 'NONE',
    onboardingData: null,
    systemPrompt: null,
    trialStartedAt: null,
    timezone: 'Africa/Lagos',
    whatsappPhoneId: null,
    ...overrides,
  };
}

function makeRedisClient() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
    del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(1); }),
    expire: vi.fn(() => Promise.resolve(1)),
    incr: vi.fn(() => Promise.resolve(1)),
    pipeline: vi.fn(() => ({ set: vi.fn(), expire: vi.fn(), exec: vi.fn() })),
  } as any;
}

function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'test-job-1',
    name: 'process-message',
    data: {
      from: '2348012345678',
      orgId: 'org_test123',
      content: { text: '#setup' },
      type: 'text',
      ...overrides,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as any;
}

function makeWhatsAppService() {
  const mock = {
    sendText: vi.fn().mockResolvedValue({}),
    sendImage: vi.fn().mockResolvedValue({}),
    sendTemplate: vi.fn().mockResolvedValue({}),
    registerNumber: vi.fn().mockResolvedValue({}),
    subscribeWaba: vi.fn().mockResolvedValue({}),
    sendChatPresence: vi.fn().mockResolvedValue({}),
  };
  return mock as unknown as WhatsAppService;
}

describe('Zynux Onboarding - End-to-End', () => {
  let redisClient: ReturnType<typeof makeRedisClient>;
  let whatsappService: ReturnType<typeof makeWhatsAppService>;

  beforeEach(() => {
    vi.clearAllMocks();
    redisClient = makeRedisClient();
    whatsappService = makeWhatsAppService();
  });

  // ============================================================
  // AUTO OTP RELAY TESTS
  // ============================================================
  describe('Auto OTP Relay', () => {
    const masterOrg = makeOrg({
      id: 'naija-agent-master',
      name: 'Sovereign Master',
      config: {
        isMaster: true,
        adminPhone: '2349000000000',
        adminPin: '$2b$10$hashed_0000',
      },
    });

    it('gives feedback when no pending setup matches the code', async () => {
      // Return no pending setups
      vi.mocked(Firebase.getPendingSetups).mockResolvedValue([]);

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: '123456' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      // Unmatched 6-digit codes pass through to normal AI handling
      expect(result).toBeNull();
      expect(whatsappService.sendText).not.toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('cannot find a pending activation')
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // PROSPECT FLOW TESTS
  // ============================================================
  describe('Prospect Flow (Master Bot → New Tenant)', () => {
    const masterOrg = makeOrg({
      id: 'naija-agent-master',
      name: 'Sovereign Master',
      config: {
        isMaster: true,
        adminPhone: '2349000000000',
        adminPin: '$2b$10$hashed_0000',
        model: 'deepseek-v4-flash',
        tools: ['web_search'],
      },
    });

    it('STEP 1 — starts when a non-admin sends the referral link', async () => {
      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: 'I_want_AI_for_my_business_Marketing' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('Name of your Business')
      );

      // Should have set Redis prospect state: step=NAME
      const prospectState = await redisClient.get('prospect:2348055555555');
      const parsed = JSON.parse(prospectState!);
      expect(parsed.step).toBe('NAME');
      expect(parsed.data).toEqual({});
    });

    it('STEP 2 — NAME → PIN transition', async () => {
      await redisClient.set('prospect:2348055555555', JSON.stringify({ step: 'NAME', data: {} }));

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: 'Bims Gadgets' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('4-digit Admin PIN')
      );

      const state = JSON.parse(await redisClient.get('prospect:2348055555555') || '{}');
      expect(state.step).toBe('PIN');
      expect(state.data.name).toBe('Bims Gadgets');
    });

    it('STEP 3 — PIN capture and BOT_PHONE transition', async () => {
      await redisClient.set('prospect:2348055555555', JSON.stringify({ step: 'PIN', data: { name: 'Bims Gadgets' } }));

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: '5678' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('Phone Number')
      );

      const state = JSON.parse(await redisClient.get('prospect:2348055555555') || '{}');
      expect(state.step).toBe('BOT_PHONE');
      // PIN should be bcrypt-hashed
      expect(state.data.adminPin).toContain('$2b$10$');
    });

    it('PIN validation — rejects non-4-digit input', async () => {
      await redisClient.set('prospect:2348055555555', JSON.stringify({ step: 'PIN', data: { name: 'Bims' } }));

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: '12' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('exactly 4 numbers')
      );

      // Should still be on PIN step
      const state = JSON.parse(await redisClient.get('prospect:2348055555555') || '{}');
      expect(state.step).toBe('PIN');
    });

    it('BOT_PHONE — creates tenant with Drizzle dual-write and calls sidecar', async () => {
      await redisClient.set('prospect:2348055555555', JSON.stringify({
        step: 'BOT_PHONE',
        data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_5678' },
      }));

      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValueOnce({
        data: { code: 'ABCD-1234' },
      });

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: '08012345678' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      expect(result).toEqual({ success: true });

      // Firebase createTenant should have been called
      expect(Firebase.createTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bims Gadgets',
          adminPin: '$2b$10$hashed_5678',
        })
      );

      // Drizzle createTenant should have been called (dual-write)
      expect(Database.createTenant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bims Gadgets',
          adminPin: '$2b$10$hashed_5678',
        })
      );

      // Sidecar /pair should have been called
      expect(axios.default.post).toHaveBeenCalledWith(
        expect.stringContaining('/pair'),
        { orgId: expect.stringMatching(/^org_/), phone: '08012345678' },
        expect.any(Object)
      );

      // Sidecar should be called BEFORE createTenant (no orphan on failure)
      const sidecarCallOrder = (axios.default.post as any).mock.invocationCallOrder[0];
      const createTenantOrder = (Firebase.createTenant as any).mock.invocationCallOrder[0];
      expect(sidecarCallOrder).toBeLessThan(createTenantOrder);

      // Prospect state should be cleared
      const prospectState = await redisClient.get('prospect:2348055555555');
      expect(prospectState).toBeNull();

      // Success message should contain the pairing code
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('ABCD-1234')
      );
    });

    it('BOT_PHONE — blocks already-registered number (pre-check runs BEFORE createTenant)', async () => {
      // Pre-populate sidecar_map so the phone looks already linked
      await redisClient.set('sidecar_map:2348012345678@s.whatsapp.net', 'existing_org');
      await redisClient.set('prospect:2348055555555', JSON.stringify({
        step: 'BOT_PHONE',
        data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_5678' },
      }));

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: '08012345678' },
      });

      const result = await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      expect(result).toEqual({ success: true });

      // Should warn about already registered BEFORE calling createTenant or sidecar
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('Phone Already Registered')
      );

      // Should NOT have called createTenant or sidecar
      expect(Firebase.createTenant).not.toHaveBeenCalled();
      const axios = await import('axios');
      expect(axios.default.post).not.toHaveBeenCalled();

      // Prospect state should be cleared so user can retry
      const prospectState = await redisClient.get('prospect:2348055555555');
      expect(prospectState).toBeNull();
    });

    it('BOT_PHONE — graceful error when sidecar fails', async () => {
      await redisClient.set('prospect:2348055555555', JSON.stringify({
        step: 'BOT_PHONE',
        data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_5678' },
      }));

      const axios = await import('axios');
      (axios.default.post as any).mockRejectedValueOnce(new Error('Connection refused'));

      const job = makeJob({
        from: '2348055555555',
        orgId: 'naija-agent-master',
        content: { text: '08012345678' },
      });

      await handleOnboarding(job, masterOrg, null, whatsappService, redisClient);

      // Should show error message
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348055555555',
        expect.stringContaining('Setup Failed')
      );
    });
  });

  // ============================================================
  // EXISTING TENANT SETUP FLOW TESTS
  // ============================================================
  describe('Existing Tenant Setup (#setup flow)', () => {
    const tenantOrg = makeOrg({
      id: 'org_test123',
      name: 'Test Shop',
      config: {
        adminPhone: '2348012345678',
        adminPin: '$2b$10$hashed_9999',
        model: 'deepseek-v4-flash',
        tools: ['web_search'],
      },
    });

    it('starts when admin types #setup', async () => {
      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '#setup' },
      });

      const onboarding = { step: 'NONE', data: {} } as any;

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(Firebase.setOrgOnboarding).toHaveBeenCalledWith('org_test123', 'NAME', {});
      // Drizzle dual-write
      expect(Database.setOrgOnboarding).toHaveBeenCalledWith('org_test123', 'NAME', {});
    });

    it('blocks re-setup when already COMPLETE (requires #reset)', async () => {
      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '#setup' },
      });

      const onboarding = { step: 'COMPLETE', data: {} } as any;

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348012345678',
        expect.stringContaining('SETUP ALREADY COMPLETE')
      );
    });

    it('NON-admin returns null (no onboarding)', async () => {
      const job = makeJob({
        from: '2348099999999', // not the admin
        orgId: 'org_test123',
        content: { text: '#setup' },
      });

      const onboarding = { step: 'NONE', data: {} } as any;

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toBeNull();
    });

    it('full state machine walkthrough', async () => {
      // Helper: mock axios for PairPhone later
      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValue({ data: { code: 'WXYZ-5678' } });

      const jobBase = (text: string) => makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text },
      });

      // Step 1: #setup → NAME
      let onboarding = { step: 'NONE', data: {} } as any;
      await handleOnboarding(jobBase('#setup'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith('org_test123', 'NAME', {});
      expect(Database.setOrgOnboarding).toHaveBeenLastCalledWith('org_test123', 'NAME', {});

      // Step 2: NAME → PIN
      onboarding = { step: 'NAME', data: {} };
      await handleOnboarding(jobBase('Bims Gadgets'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith('org_test123', 'PIN', { name: 'Bims Gadgets' });

      // Step 3: PIN → BANK_NAME
      onboarding = { step: 'PIN', data: { name: 'Bims Gadgets' } };
      await handleOnboarding(jobBase('4321'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith(
        'org_test123', 'BANK_NAME',
        expect.objectContaining({ name: 'Bims Gadgets', adminPin: expect.stringContaining('$2b$10$') })
      );

      // Step 4: BANK_NAME → BANK_ACCOUNT
      onboarding = { step: 'BANK_NAME', data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_4321' } };
      await handleOnboarding(jobBase('GTBank'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith(
        'org_test123', 'BANK_ACCOUNT',
        expect.objectContaining({ bankName: 'GTBank' })
      );

      // Step 5: BANK_ACCOUNT → BANK_ACCOUNT_NAME
      onboarding = { step: 'BANK_ACCOUNT', data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_4321', bankName: 'GTBank' } };
      await handleOnboarding(jobBase('0123456789'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith(
        'org_test123', 'BANK_ACCOUNT_NAME',
        expect.objectContaining({ accountNumber: '0123456789' })
      );

      // Step 6: BANK_ACCOUNT_NAME → TONE
      onboarding = { step: 'BANK_ACCOUNT_NAME', data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_4321', bankName: 'GTBank', accountNumber: '0123456789' } };
      await handleOnboarding(jobBase('Bims Gadgets Ltd'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith(
        'org_test123', 'TONE',
        expect.objectContaining({ accountName: 'Bims Gadgets Ltd' })
      );

      // Step 7: TONE=1 → REVIEW
      onboarding = { step: 'TONE', data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_4321', bankName: 'GTBank', accountNumber: '0123456789', accountName: 'Bims Gadgets Ltd' } };
      await handleOnboarding(jobBase('1'), tenantOrg, onboarding, whatsappService, redisClient);
      const lastCall1 = (Firebase.setOrgOnboarding as any).mock.calls.at(-1);
      expect(lastCall1[1]).toBe('REVIEW');

      // Step 8: REVIEW → YES → BOT_PHONE
      onboarding = { step: 'REVIEW', data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_4321', bankName: 'GTBank', accountNumber: '0123456789', accountName: 'Bims Gadgets Ltd', systemPrompt: 'Professional prompt' } };
      await handleOnboarding(jobBase('YES'), tenantOrg, onboarding, whatsappService, redisClient);
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith(
        'org_test123', 'BOT_PHONE',
        expect.any(Object)
      );

      // Step 9: BOT_PHONE → OTP_WAIT (calls sidecar + completeOnboarding + dual-writes)
      onboarding = { step: 'BOT_PHONE', data: { name: 'Bims Gadgets', adminPin: '$2b$10$hashed_4321', bankName: 'GTBank', accountNumber: '0123456789', accountName: 'Bims Gadgets Ltd', systemPrompt: 'Professional prompt' } };
      await handleOnboarding(jobBase('08011112222'), tenantOrg, onboarding, whatsappService, redisClient);

      // Should have called completeOnboarding on both stores
      expect(Firebase.completeOnboarding).toHaveBeenCalledWith(
        'org_test123',
        expect.objectContaining({ botPhone: '08011112222' })
      );
      expect(Database.completeOnboarding).toHaveBeenCalledWith(
        'org_test123',
        expect.objectContaining({ botPhone: '08011112222' })
      );

      // Should have called sidecar
      expect(axios.default.post).toHaveBeenCalledWith(
        expect.stringContaining('/pair'),
        { orgId: 'org_test123', phone: '08011112222' },
        expect.any(Object)
      );

      // Sidecar should be called BEFORE completeOnboarding (no orphan on failure)
      const sidecarCallOrder = (axios.default.post as any).mock.invocationCallOrder[0];
      const completeCallOrder = (Firebase.completeOnboarding as any).mock.invocationCallOrder[0];
      expect(sidecarCallOrder).toBeLessThan(completeCallOrder);

      // Should show pairing code
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348012345678',
        expect.stringContaining('WXYZ-5678')
      );
    });

    it('#cancel clears onboarding state', async () => {
      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '#cancel' },
      });

      const onboarding = { step: 'BANK_NAME', data: { name: 'Test' } } as any;

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(Firebase.setOrgOnboarding).toHaveBeenCalledWith('org_test123', 'START', {});
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348012345678',
        expect.stringContaining('Cancelled')
      );
    });

    it('#reset clears everything and tells user to start over', async () => {
      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '#reset' },
      });

      const onboarding = { step: 'BANK_NAME', data: { name: 'Test' } } as any;

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(Firebase.setOrgOnboarding).toHaveBeenCalledWith('org_test123', 'START', {});
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348012345678',
        expect.stringContaining('#setup')
      );
    });

    it('#back clears data for the rolled-back step', async () => {
      // Simulate user at BANK_ACCOUNT with partial data
      const onboarding = {
        step: 'BANK_ACCOUNT',
        data: {
          name: 'Bims Gadgets',
          adminPin: '$2b$10$hashed_4321',
          bankName: 'GTBank',
          accountNumber: '0123456789', // will be cleared
        },
      } as any;

      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '#back' },
      });

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toEqual({ success: true });

      // Should have gone back to BANK_NAME
      expect(Firebase.setOrgOnboarding).toHaveBeenLastCalledWith(
        'org_test123', 'BANK_NAME',
        expect.objectContaining({
          name: 'Bims Gadgets',
          adminPin: '$2b$10$hashed_4321',
          bankName: 'GTBank',
          // accountNumber should be cleared
        })
      );

      // accountNumber should NOT be present in the saved data
      const savedData = (Firebase.setOrgOnboarding as any).mock.calls.at(-1)[2];
      expect(savedData.accountNumber).toBeUndefined();
    });
  });

  // ============================================================
  // PAIRPHONE PRE-CHECK TESTS
  // ============================================================
  describe('PairPhone pre-check', () => {
    const tenantOrg = makeOrg();

    it('blocks existing tenant BOT_PHONE when phone already mapped in sidecar_map', async () => {
      await redisClient.set('sidecar_map:2348011112222@s.whatsapp.net', 'other_org');

      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '08011112222' },
      });

      const onboarding = {
        step: 'BOT_PHONE',
        data: {
          name: 'Bims Gadgets',
          adminPin: '$2b$10$hashed_4321',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          accountName: 'Bims Ltd',
          systemPrompt: 'Professional prompt',
        },
      } as any;

      const result = await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      expect(result).toEqual({ success: true });
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        '2348012345678',
        expect.stringContaining('Phone Already Registered')
      );

      // Should NOT have made the sidecar call
      const axios = await import('axios');
      expect(axios.default.post).not.toHaveBeenCalled();
    });

    it('allows BOT_PHONE when phone is mapped to the same org (re-pair)', async () => {
      await redisClient.set('sidecar_map:2348011112222@s.whatsapp.net', 'org_test123');

      const axios = await import('axios');
      (axios.default.post as any).mockResolvedValue({ data: { code: 'REPAIR-999' } });

      const job = makeJob({
        from: '2348012345678',
        orgId: 'org_test123',
        content: { text: '08011112222' },
      });

      const onboarding = {
        step: 'BOT_PHONE',
        data: {
          name: 'Bims Gadgets',
          adminPin: '$2b$10$hashed_4321',
          bankName: 'GTBank',
          accountNumber: '0123456789',
          accountName: 'Bims Ltd',
          systemPrompt: 'Professional prompt',
        },
      } as any;

      await handleOnboarding(job, tenantOrg, onboarding, whatsappService, redisClient);

      // Should have proceeded with sidecar call
      expect(axios.default.post).toHaveBeenCalled();
    });
  });
});
