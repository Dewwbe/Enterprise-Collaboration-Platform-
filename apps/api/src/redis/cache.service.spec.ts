import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

describe('CacheService', () => {
  let service: CacheService;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    scan: jest.Mock;
    quit: jest.Mock;
  };

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
      quit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CacheService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  describe('get', () => {
    it('returns the parsed value on a hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));

      await expect(service.get('key')).resolves.toEqual({ a: 1 });
    });

    it('returns null on a miss', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.get('key')).resolves.toBeNull();
    });

    it('fails open (returns null) when Redis throws', async () => {
      redis.get.mockRejectedValue(new Error('connection refused'));

      await expect(service.get('key')).resolves.toBeNull();
    });
  });

  describe('set', () => {
    it('serializes the value with the given TTL', async () => {
      await service.set('key', { a: 1 }, 60);

      expect(redis.set).toHaveBeenCalledWith('key', JSON.stringify({ a: 1 }), 'EX', 60);
    });

    it('swallows Redis errors instead of throwing', async () => {
      redis.set.mockRejectedValue(new Error('connection refused'));

      await expect(service.set('key', {}, 60)).resolves.toBeUndefined();
    });
  });

  describe('delByPrefix', () => {
    it('scans and deletes all matching keys across pages', async () => {
      redis.scan
        .mockResolvedValueOnce(['5', ['a:1', 'a:2']])
        .mockResolvedValueOnce(['0', ['a:3']]);

      await service.delByPrefix('a:');

      expect(redis.scan).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('a:1', 'a:2');
      expect(redis.del).toHaveBeenCalledWith('a:3');
    });
  });

  describe('onModuleDestroy', () => {
    it('quits the underlying Redis connection', async () => {
      await service.onModuleDestroy();

      expect(redis.quit).toHaveBeenCalled();
    });
  });
});
