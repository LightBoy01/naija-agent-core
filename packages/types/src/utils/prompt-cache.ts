import type { Redis } from 'ioredis';

/**
 * Redis-based prompt cache with 1-hour TTL.
 * Caches assembled prompts by key to avoid repeated filesystem reads.
 */
export class PromptCache {
  constructor(
    private redis: Redis,
    private prefix: string,
  ) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(`prompt:${this.prefix}:${key}`);
  }

  async set(key: string, value: string, ttlSeconds = 3600): Promise<void> {
    await this.redis.setex(`prompt:${this.prefix}:${key}`, ttlSeconds, value);
  }

  async invalidate(keyPattern?: string): Promise<void> {
    const pattern = keyPattern
      ? `prompt:${this.prefix}:${keyPattern}`
      : `prompt:${this.prefix}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
