import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';
import { CacheService } from '../../redis/cache.service';

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let cache: { ping: jest.Mock };

  beforeEach(async () => {
    cache = { ping: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisHealthIndicator, { provide: CacheService, useValue: cache }],
    }).compile();

    indicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
  });

  it('reports "up" when Redis responds to PING', async () => {
    cache.ping.mockResolvedValue(true);

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'up' },
    });
  });

  it('throws HealthCheckError when Redis is unreachable', async () => {
    cache.ping.mockResolvedValue(false);

    await expect(indicator.isHealthy('redis')).rejects.toBeInstanceOf(HealthCheckError);
  });
});
