import { PipelineContext, Interceptor } from './types.js';
import { logger } from '../utils/logger.js';

export class MessagePipeline {
  private interceptors: Interceptor[] = [];

  /**
   * Add a new interceptor to the chain.
   * Order matters: they execute sequentially.
   */
  use(interceptor: Interceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  /**
   * Execute the pipeline.
   * Stops early if an interceptor sets `ctx.shortCircuit = true`.
   */
  async execute(initialContext: PipelineContext): Promise<PipelineContext> {
    let currentContext = initialContext;

    for (const interceptor of this.interceptors) {
      try {
        currentContext = await interceptor.execute(currentContext);
        
        if (currentContext.shortCircuit) {
          logger.info(
            { orgId: currentContext.orgId, from: currentContext.from, reason: currentContext.shortCircuitReason },
            `Pipeline short-circuited at [${interceptor.name}]`
          );
          break; // Stop processing further interceptors
        }
      } catch (error: any) {
         // If a critical error happens inside an interceptor, we capture it and short circuit.
         logger.error({ interceptor: interceptor.name, error: error.message }, 'Interceptor threw an error');
         currentContext.shortCircuit = true;
         currentContext.isError = true;
         currentContext.errorMessage = error.message;
         break;
      }
    }

    return currentContext;
  }
}
