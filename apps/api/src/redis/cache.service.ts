import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Thin cache-aside wrapper around ioredis. Every method is fail-open: a
 * Redis error is logged and treated as a cache miss / no-op rather than
 * propagated, since caching must never be why a request fails.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Without this, the raw ioredis connection outlives app.close() (it has no
  // lifecycle hook of its own), which keeps the event loop alive - harmless
  // in the running server, but it leaves e2e test runs hanging after every
  // test has already passed.
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`Cache get failed for "${key}": ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache set failed for "${key}": ${(error as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`Cache del failed for "${key}": ${(error as Error).message}`);
    }
  }

  /** Unlike the cache-aside methods above, this reports failure instead of hiding it - used by the health check. */
  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch (error) {
      this.logger.warn(`Cache ping failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** Deletes every key matching a prefix, using SCAN so it never blocks Redis. */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = next;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Cache delByPrefix failed for "${prefix}": ${(error as Error).message}`,
      );
    }
  }
}
