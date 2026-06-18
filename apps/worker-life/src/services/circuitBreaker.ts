import { logger } from '../utils/logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: CircuitState = 'CLOSED';
  private lastStateChange = Date.now();

  constructor(
    private name: string,
    private failureThreshold = 3,
    private cooldownMs = 60_000,
    private failureWindowMs = 30_000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange > this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.lastStateChange = Date.now();
        logger.info({ name: this.name }, 'Circuit breaker -> HALF_OPEN (probing)');
      } else {
        throw new Error(`Circuit ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      if (this.state === 'HALF_OPEN') {
        this.reset();
        logger.info({ name: this.name }, 'Circuit breaker -> CLOSED (probe succeeded)');
      }
      return result;
    } catch (e) {
      const now = Date.now();
      if (now - this.lastFailure > this.failureWindowMs) {
        this.failures = 1;
      } else {
        this.failures++;
      }
      this.lastFailure = now;
      if (this.failures >= this.failureThreshold && this.state === 'CLOSED') {
        this.state = 'OPEN';
        this.lastStateChange = Date.now();
        logger.error({ name: this.name, failures: this.failures }, 'Circuit breaker -> OPEN');
      }
      throw e;
    }
  }

  private reset() {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastStateChange = Date.now();
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Shared breakers for critical external services
export const monnifyBreaker = new CircuitBreaker('monnify', 3, 60_000, 30_000);
export const groqBreaker = new CircuitBreaker('groq-whisper', 3, 120_000, 30_000);
export const geminiBreaker = new CircuitBreaker('gemini', 5, 60_000, 30_000);
