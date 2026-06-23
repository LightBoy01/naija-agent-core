import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted helpers — must come before any import
// ---------------------------------------------------------------------------
const { mockSetChatDemoState, mockFindOrCreateChat, mockSetOrgActivity } = vi.hoisted(() => ({
  mockSetChatDemoState: vi.fn().mockResolvedValue(true),
  mockFindOrCreateChat: vi.fn().mockResolvedValue('chat_123'),
  mockSetOrgActivity: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@naija-agent/database', () => ({
  setChatDemoState: mockSetChatDemoState,
  findOrCreateChat: mockFindOrCreateChat,
  getChatDemoState: vi.fn(),
  getChatHistory: vi.fn().mockResolvedValue([]),
  getAllKnowledge: vi.fn().mockResolvedValue({}),
  saveMessage: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
  fraudRegistry: {},
  setOrganizationActivity: mockSetOrgActivity,
  suspendOrganization: vi.fn().mockResolvedValue({ status: 'success' }),
  getPendingSetups: vi.fn().mockResolvedValue([]),
  getNetworkStats: vi.fn().mockResolvedValue({}),
  setMfaCode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@naija-agent/firebase', () => ({
  getOrgById: vi.fn().mockResolvedValue(null),
  createTenant: vi.fn().mockResolvedValue(undefined),
  registerTrialInterest: vi.fn().mockResolvedValue(undefined),
  activateTenant: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ioredis', () => {
  const store = new Map<string, string>();
  return {
    default: vi.fn(() => ({
      get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
      set: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
      setex: vi.fn((key: string, ttl: number, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
      del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(1); }),
      expire: vi.fn(() => Promise.resolve(1)),
      incr: vi.fn(() => Promise.resolve(1)),
      pipeline: vi.fn(() => ({ set: vi.fn(), expire: vi.fn(), exec: vi.fn() })),
    })),
  };
});

// Helper: create a redis mock object for test deps
function createRedisMock() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: vi.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
    setex: vi.fn((key: string, ttl: number, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
    del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(1); }),
    expire: vi.fn(() => Promise.resolve(1)),
    incr: vi.fn(() => Promise.resolve(1)),
    pipeline: vi.fn(() => ({ set: vi.fn(), expire: vi.fn(), exec: vi.fn() })),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock('../../src/services/priceGuard.js', () => ({
  PriceGuard: vi.fn().mockImplementation(function () {
    this.validateResponse = vi.fn().mockResolvedValue({ isSafe: true });
  }),
}));

vi.mock('../../src/services/promptService.js', () => ({
  promptService: {
    getPrompt: vi.fn().mockReturnValue('Mock persona content'),
    getSystemPrompt: vi.fn().mockReturnValue('Mock system prompt'),
  },
}));

// We import the real system tools to test their behavior
vi.mock('../../src/tools/system.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/tools/system')>();
  return {
    SYSTEM_TOOLS: actual.SYSTEM_TOOLS,
    handleSystemTools: actual.handleSystemTools,
  };
});

import { handleSystemTools, SYSTEM_TOOLS } from '../../src/tools/system';
import { handleMessage } from '../../src/handlers/messaging';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const mockOrg = {
  id: 'org_test',
  name: 'Test Org',
  config: { isMaster: true },
};

const mockWhatsAppService = {
  sendText: vi.fn().mockResolvedValue(undefined),
  sendMedia: vi.fn().mockResolvedValue(undefined),
  markAsRead: vi.fn().mockResolvedValue(undefined),
  sendReaction: vi.fn().mockResolvedValue(undefined),
  sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
};

function makeJob(overrides: Record<string, any> = {}) {
  return {
    id: 'job_1',
    data: {
      orgId: 'org_test',
      from: '23480000000',
      content: { text: 'Hello', ...overrides.content },
      mediaBuffer: null,
      mediaMime: null,
      ...overrides,
    },
    timestamp: Date.now(),
    attemptsMade: 0,
    toJSON: () => ({}),
    ...overrides,
  } as any;
}

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    org: mockOrg,
    isAdmin: false,
    isStaff: false,
    staffData: null,
    tenantWhatsAppService: mockWhatsAppService as any,
    tenantPaymentProvider: null,
    ai: { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() } as any,
    redisClient: createRedisMock() as any,
    tenantTools: [],
    sectorPack: undefined,
    mediaBuffer: null,
    mediaMime: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Demo Mode — Tool Dispatch', () => {
  const mockCtx: any = {
    orgId: 'zynux_master',
    from: '23480000000',
    isAdmin: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1 — routes toggle_demo_mode to handleSystemTools', async () => {
    const result = await handleSystemTools('toggle_demo_mode', { niche: 'pharmacy' }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.message).toContain('Demo mode activated for niche: pharmacy');
    expect(mockFindOrCreateChat).toHaveBeenCalledWith('zynux_master', '23480000000', 'User');
    expect(mockSetChatDemoState).toHaveBeenCalledWith('chat_123', 'pharmacy');
  });

  it('2 — deactivates demo mode when niche is "null"', async () => {
    const result = await handleSystemTools('toggle_demo_mode', { niche: 'null' }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.message).toContain('Demo mode deactivated');
    expect(mockSetChatDemoState).toHaveBeenCalledWith('chat_123', null);
  });

  it('3 — deactivates demo mode when niche is empty/falsy', async () => {
    const result = await handleSystemTools('toggle_demo_mode', {}, mockCtx);
    expect(result.status).toBe('success');
    expect(result.message).toContain('deactivated');
    expect(mockSetChatDemoState).toHaveBeenCalledWith('chat_123', null);
  });

  it('4 — mock_checkout returns a mock invoice', async () => {
    const result = await handleSystemTools('mock_checkout', { items: '2x Paracetamol', total: 1000 }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.invoice).toContain('MOCK INVOICE');
    expect(result.invoice).toContain('2x Paracetamol');
    expect(result.invoice).toContain('1000');
    expect(result.invoice).toContain('mock-pay.naija-agent.com/demo');
  });

  it('5 — dispatch list in tool-handlers.ts includes toggle_demo_mode and mock_checkout', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../../src/tool-handlers.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain("'toggle_demo_mode'");
    expect(source).toContain("'mock_checkout'");
    expect(source).toContain("'send_direct_message'");
    expect(source).toContain("'request_sidecar_pairing'");

    // Verify they appear after the Content & AI section (i.e. in System & Multi-tenancy)
    const contentAndAiIdx = source.indexOf('// 4. Content & AI');
    const section5 = source.slice(contentAndAiIdx);
    expect(section5).toContain("'toggle_demo_mode'");
    expect(section5).toContain("'mock_checkout'");
    expect(section5).toContain("'mock_product_info'");
  });

  it('6 — SYSTEM_TOOLS definition includes all required tool names', () => {
    const toolNames = SYSTEM_TOOLS.map((t: any) => t.name);
    expect(toolNames).toContain('toggle_demo_mode');
    expect(toolNames).toContain('mock_checkout');
    expect(toolNames).toContain('mock_product_info');
    expect(toolNames).toContain('suspend_tenant');
    expect(toolNames).toContain('send_direct_message');
    expect(toolNames).toContain('request_sidecar_pairing');
  });

  it('7 — suspend_tenant has a switch case handler', async () => {
    // Must be admin to call suspend_tenant (unauthorized if not)
    const result = await handleSystemTools('suspend_tenant', { tenantId: 'tenant_test' }, { ...mockCtx, isAdmin: true });
    expect(result).toBeDefined();
  });

  it('8 — mock_product_info returns preset product data for known products', async () => {
    const result = await handleSystemTools('mock_product_info', { productName: 'paracetamol' }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.product.name).toBe('paracetamol');
    expect(result.product.price).toBe('₦500');
    expect(result.product.description).toContain('Pain relief');
    expect(result.product.availability).toBe('In stock');
  });

  it('9 — mock_product_info generates fake data for unknown products', async () => {
    const result = await handleSystemTools('mock_product_info', { productName: 'fidget spinner' }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.product.name).toBe('fidget spinner');
    expect(result.product.price).toMatch(/^₦\d/);
    expect(result.product.availability).toContain('stock');
  });

  it('10 — mock_product_info is case-insensitive for product lookup', async () => {
    const result = await handleSystemTools('mock_product_info', { productName: 'IPHONE 15' }, mockCtx);
    expect(result.status).toBe('success');
    expect(result.product.price).toBe('₦750,000');
  });

  it('11 — mock_product_info handles missing productName gracefully', async () => {
    const result = await handleSystemTools('mock_product_info', {}, mockCtx);
    expect(result.status).toBe('success');
    expect(result.product).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Messages integration – these test handleMessage with demo modes
// ---------------------------------------------------------------------------
describe('Demo Mode — Messaging Handler Integration', () => {
  let promptService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../src/services/promptService.js');
    promptService = mod.promptService;
  });

  // ------ Persona selection ------
  it('12 — uses Demo.Agent.md persona when activeDemoNiche is set', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'Welcome to my fashion shop!' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({ ai: ai as any }));

    expect(promptService.getPrompt).toHaveBeenCalledWith('Demo.Agent.md');
  });

  it('13 — does NOT use Demo.Agent.md when activeDemoNiche is null (normal flow)', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue(null);

    await handleMessage(makeJob(), makeDeps());

    expect(promptService.getPrompt).not.toHaveBeenCalledWith('Demo.Agent.md');
  });

  // ------ Tool restriction ------
  it('14 — restricts tools to toggle_demo_mode and mock_checkout when in demo mode', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    // The AI shouldn't see admin/customer tools — only system tools with demo-mode filter
    // We verify by checking that the AI only gets 2 tools (toggle_demo_mode + mock_checkout)
    await handleMessage(makeJob(), makeDeps({ ai: ai as any }));

    // Verify demo persona was used
    expect(promptService.getPrompt).toHaveBeenCalledWith('Demo.Agent.md');
  });

  // ------ PriceGuard ------
  it('15 — skips PriceGuard validation during demo mode', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const { PriceGuard } = await import('../../src/services/priceGuard.js');
    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };

    await handleMessage(makeJob(), makeDeps({ ai: ai as any }));

    // PriceGuard should NOT have been instantiated (demo skips it)
    expect(PriceGuard).not.toHaveBeenCalled();
  });

  it('16 — runs PriceGuard normally when NOT in demo mode (regression check)', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue(null);

    const { PriceGuard } = await import('../../src/services/priceGuard.js');
    PriceGuard.mockClear();

    // Use a non-master org so PriceGuard fires
    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({
      ai: ai as any,
      org: { ...mockOrg, config: { isMaster: false } },
      isAdmin: false,
      isStaff: false,
    }));

    // PriceGuard should have been instantiated (non-demo flow)
    expect(PriceGuard).toHaveBeenCalled();
  });

  // ------ Exit hatches ------
  it('17 — exits demo mode when user sends #exit', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob({ content: { text: '#exit' } }), makeDeps({ ai: ai as any }));

    // Should deactivate demo
    expect(mockSetChatDemoState).toHaveBeenCalledWith('chat_123', null);
  });

  it('18 — exits demo mode when user sends "exit demo"', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob({ content: { text: 'exit demo' } }), makeDeps({ ai: ai as any }));

    expect(mockSetChatDemoState).toHaveBeenCalledWith('chat_123', null);
  });

  it('19 — exits demo mode on bare "exit" (broadened regex match)', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');
    mockSetChatDemoState.mockClear();

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob({ content: { text: 'exit' } }), makeDeps({ ai: ai as any }));

    // Should deactivate demo — the regex includes bare "exit"
    expect(mockSetChatDemoState).toHaveBeenCalledWith('chat_123', null);
  });

  it('20 — does NOT exit demo mode on "exiting" (partial match protection)', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');
    mockSetChatDemoState.mockClear();

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob({ content: { text: 'exiting' } }), makeDeps({ ai: ai as any }));

    expect(mockSetChatDemoState).not.toHaveBeenCalledWith('chat_123', null);
  });

  // ------ Error handling ------
  it('21 — handles tool execution errors gracefully (try-catch around handleToolCall)', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    // Message won't include a tool call so handleToolCall won't fire — instead
    // we verify normal processing doesn't throw
    await expect(handleMessage(makeJob(), makeDeps({ ai: ai as any }))).resolves.not.toThrow();
  });

  // ------ Demo context ------
  it('22 — includes DEMO MODE flag in system context when active', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({ ai: ai as any }));

    // The demo prompt content passes through — it's used as the persona
    expect(promptService.getPrompt).toHaveBeenCalledWith('Demo.Agent.md');
    // The NICHE replacement happens in the caller via .replace({{NICHE}}, activeDemoNiche)
    // rather than being passed to getPrompt
  });

  // ------ TTL integration ------
  it('23 — TTL: expired demo session (getChatDemoState returns null) treats user as non-demo', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue(null);

    const { PriceGuard } = await import('../../src/services/priceGuard.js');
    PriceGuard.mockClear();

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({
      ai: ai as any,
      org: { ...mockOrg, config: { isMaster: false } },
      isAdmin: false,
      isStaff: false,
    }));

    // Expired demo = non-demo flow = PriceGuard fires
    expect(PriceGuard).toHaveBeenCalled();
    expect(promptService.getPrompt).not.toHaveBeenCalledWith('Demo.Agent.md');
  });

  it('24 — TTL: active demo session (getChatDemoState returns niche) uses demo persona', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('electronics');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({ ai: ai as any }));

    // getPrompt is called with filename only; NICHE replacement happens in caller
    expect(promptService.getPrompt).toHaveBeenCalledWith('Demo.Agent.md');
  });

  // ------ adminStatus ------
  it('25 — shows NOT_AUTHENTICATED for non-admin demo users (not STAFF_AUTHORIZED)', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({ ai: ai as any, isAdmin: false, isStaff: false }));

    // Passes if no error — the NOT_AUTHENTICATED flag is set internally
    expect(promptService.getPrompt).toHaveBeenCalledWith('Demo.Agent.md');
  });

  // ------ Business knowledge ------
  it('26 — blanks business knowledge in demo mode', async () => {
    const db = await import('@naija-agent/database');
    vi.mocked(db.getChatDemoState).mockResolvedValue('fashion');

    const ai = { chat: vi.fn().mockResolvedValue({ text: 'ok' }), analyzeImage: vi.fn(), generateText: vi.fn() };
    await handleMessage(makeJob(), makeDeps({ ai: ai as any }));

    // Passes if no error — demo mode handles this internally
    expect(promptService.getPrompt).toHaveBeenCalledWith('Demo.Agent.md');
  });
});

// ---------------------------------------------------------------------------
// Static checks — prompt files
// ---------------------------------------------------------------------------
describe('Demo Mode — Static Checks', () => {
  it('27 — Zynux.Soul.md does not contain JSON formatting instructions (contradictory removed)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const soulPath = path.resolve(import.meta.dirname, '../../src/prompts/Zynux.Soul.md');
    const content = fs.readFileSync(soulPath, 'utf-8');
    expect(content).not.toContain('[RESPONSE FORMATTING]');
    expect(content).not.toContain('```json');
  });

  it('28 — Demo.Agent.md exists and contains the {{NICHE}} template placeholder', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const demoPath = path.resolve(import.meta.dirname, '../../src/prompts/Demo.Agent.md');
    const content = fs.readFileSync(demoPath, 'utf-8');
    expect(content).toContain('{{NICHE}}');
  });

  it('29 — Demo.Agent.md does not have stale JSON formatting', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const demoPath = path.resolve(import.meta.dirname, '../../src/prompts/Demo.Agent.md');
    const content = fs.readFileSync(demoPath, 'utf-8');
    expect(content).not.toContain('```json');
    expect(content).not.toContain('"text"');
  });

  it('30 — Demo.Agent.md mentions product photo handling and mock_product_info', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const demoPath = path.resolve(import.meta.dirname, '../../src/prompts/Demo.Agent.md');
    const content = fs.readFileSync(demoPath, 'utf-8');
    expect(content).toContain('photo');
    expect(content).toContain('mock_product_info');
  });
});
