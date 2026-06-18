import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpamInterceptor } from '../../src/pipeline/interceptors/spam.js';
import { PipelineContext } from '../../src/pipeline/types.js';

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    job: {
      data: {
        content: {
          text: 'Hello world',
        },
      },
    },
    orgId: 'org-1',
    from: '2348012345678',
    type: 'text',
    redisClient: {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as any,
    ai: {} as any,
    globalPaymentProvider: null,
    defaultWhatsAppService: {} as any,
    billing: { deducted: false, amount: 0, rollback: vi.fn() },
    shortCircuit: false,
    ...overrides,
  } as any;
}

describe('SpamInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip non-text message types', async () => {
    const ctx = makeCtx({ type: 'image' });
    const result = await SpamInterceptor.execute(ctx);
    expect(result.shortCircuit).toBe(false);
  });

  it('should skip empty text payload', async () => {
    const ctx = makeCtx({ type: 'text', job: { data: { content: { text: '' } } } as any });
    const result = await SpamInterceptor.execute(ctx);
    expect(result.shortCircuit).toBe(false);
  });

  it('should allow first occurrence of text through', async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const ctx = makeCtx({ redisClient: { incr, expire: vi.fn() } as any });

    const result = await SpamInterceptor.execute(ctx);
    expect(result.shortCircuit).toBe(false);
    expect(incr).toHaveBeenCalledTimes(1);
  });

  it('should allow second occurrence through', async () => {
    const incr = vi.fn().mockResolvedValue(2);
    const ctx = makeCtx({ redisClient: { incr, expire: vi.fn() } as any });

    const result = await SpamInterceptor.execute(ctx);
    expect(result.shortCircuit).toBe(false);
  });

  it('should short-circuit at third occurrence of same text', async () => {
    const incr = vi.fn().mockResolvedValue(3);
    const ctx = makeCtx({ redisClient: { incr, expire: vi.fn() } as any });

    const result = await SpamInterceptor.execute(ctx);
    expect(result.shortCircuit).toBe(true);
    expect(result.shortCircuitReason).toBe('SPAM_REPETITION');
  });

  it('should block fourth+ occurrences', async () => {
    const incr = vi.fn().mockResolvedValue(5);
    const ctx = makeCtx({ redisClient: { incr, expire: vi.fn() } as any });

    const result = await SpamInterceptor.execute(ctx);
    expect(result.shortCircuit).toBe(true);
    expect(result.shortCircuitReason).toBe('SPAM_REPETITION');
  });

  it('should use correct Redis key format', async () => {
    const incr = vi.fn().mockResolvedValue(1);
    const ctx = makeCtx({
      orgId: 'my-org',
      from: '2348012345678',
      redisClient: { incr, expire: vi.fn() } as any,
    });

    await SpamInterceptor.execute(ctx);
    expect(incr).toHaveBeenCalledWith(expect.stringMatching(/^spam_history:my-org:2348012345678:[a-f0-9]{32}$/));
  });
});
