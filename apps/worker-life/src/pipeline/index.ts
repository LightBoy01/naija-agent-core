import { LifePipelineContext, LifeInterceptor } from './types.js';
import { logger } from '../utils/logger.js';

export class LifePipeline {
  private interceptors: LifeInterceptor[] = [];

  use(interceptor: LifeInterceptor): this {
    this.interceptors.push(interceptor);
    return this;
  }

  async execute(initialContext: LifePipelineContext): Promise<LifePipelineContext> {
    let currentContext = initialContext;

    for (const interceptor of this.interceptors) {
      try {
        currentContext = await interceptor.execute(currentContext);
        
        if (currentContext.shortCircuit) {
          logger.info(
            { userPhone: currentContext.userPhone, reason: currentContext.shortCircuitReason },
            `LifePipeline short-circuited at [${interceptor.name}]`
          );
          break;
        }
      } catch (error: any) {
         logger.error({ interceptor: interceptor.name, error: error.message }, 'Life Interceptor threw an error');
         currentContext.shortCircuit = true;
         currentContext.isError = true;
         currentContext.errorMessage = error.message;
         break;
      }
    }

    return currentContext;
  }
}
