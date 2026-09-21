import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { CacheService } from '../../redis/cache.service';

/** Confirms Redis is reachable via the same client BullMQ/CacheService depend on. */
@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly cache: CacheService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const up = await this.cache.ping();
    if (!up) {
      throw new HealthCheckError(`${key} check failed`, {
        [key]: { status: 'down' },
      });
    }
    return { [key]: { status: 'up' } };
  }
}
