import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagePipeline } from '../../src/pipeline/index.js';
import { PipelineContext, Interceptor } from '../../src/pipeline/types.js';

describe('Message Pipeline Execution', () => {
  let initialContext: PipelineContext;

  beforeEach(() => {
    initialContext = {
      job: { id: 'test-job' } as any,
      orgId: 'org-123',
      from: 'user-456',
      type: 'text',
      ai: {} as any,
      redisClient: {} as any,
      globalPaymentProvider: null,
      defaultWhatsAppService: {} as any,
      billing: { deducted: false, amount: 0, rollback: vi.fn() },
      shortCircuit: false,
    };
  });

  it('should execute interceptors sequentially and return modified context', async () => {
    const interceptor1: Interceptor = {
      name: 'Step1',
      execute: async (ctx) => {
        ctx.isAdmin = true;
        return ctx;
      }
    };

    const interceptor2: Interceptor = {
      name: 'Step2',
      execute: async (ctx) => {
        ctx.billing.amount = 100;
        return ctx;
      }
    };

    const pipeline = new MessagePipeline().use(interceptor1).use(interceptor2);
    const resultContext = await pipeline.execute(initialContext);

    expect(resultContext.isAdmin).toBe(true);
    expect(resultContext.billing.amount).toBe(100);
    expect(resultContext.shortCircuit).toBe(false);
  });

  it('should short-circuit execution when an interceptor sets shortCircuit to true', async () => {
    const interceptor1: Interceptor = {
      name: 'Step1',
      execute: async (ctx) => {
        ctx.shortCircuit = true;
        ctx.shortCircuitReason = 'BLOCKED_BY_STEP1';
        return ctx;
      }
    };

    const interceptor2: Interceptor = {
      name: 'Step2',
      execute: async (ctx) => {
        // This should not be executed
        ctx.isAdmin = true;
        return ctx;
      }
    };

    const pipeline = new MessagePipeline().use(interceptor1).use(interceptor2);
    const resultContext = await pipeline.execute(initialContext);

    expect(resultContext.shortCircuit).toBe(true);
    expect(resultContext.shortCircuitReason).toBe('BLOCKED_BY_STEP1');
    expect(resultContext.isAdmin).toBeUndefined(); // Should not have reached Step 2
  });

  it('should handle critical errors thrown by interceptors securely', async () => {
     const errorInterceptor: Interceptor = {
        name: 'ErrorStep',
        execute: async () => {
           throw new Error('Database Connection Failed');
        }
     };

     const pipeline = new MessagePipeline().use(errorInterceptor);
     const resultContext = await pipeline.execute(initialContext);

     expect(resultContext.shortCircuit).toBe(true);
     expect(resultContext.isError).toBe(true);
     expect(resultContext.errorMessage).toBe('Database Connection Failed');
  });
});
