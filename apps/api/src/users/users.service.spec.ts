import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: { user: { findUnique: jest.Mock } };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('returns the cached profile without querying the database', async () => {
      cache.get.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

      const result = await service.findById('user-1');

      expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('queries and caches on a cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

      const result = await service.findById('user-1');

      expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
      expect(cache.set).toHaveBeenCalledWith(
        'user-profile:user-1',
        { id: 'user-1', email: 'a@b.com' },
        120,
      );
    });

    it('throws NotFoundException without caching when the user does not exist', async () => {
      cache.get.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findById('user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
