import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { TaskStatus } from '../common/enums/task-status.enum';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock };
    workspaceMember: { count: jest.Mock };
    project: { count: jest.Mock };
    task: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
  };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      workspaceMember: { count: jest.fn() },
      project: { count: jest.fn() },
      task: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    };
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

  describe('getDashboard', () => {
    it('returns the cached dashboard without querying the database', async () => {
      cache.get.mockResolvedValue({ workspaceCount: 2 });

      const result = await service.getDashboard('user-1');

      expect(result).toEqual({ workspaceCount: 2 });
      expect(prisma.workspaceMember.count).not.toHaveBeenCalled();
    });

    it('aggregates and caches on a cache miss', async () => {
      cache.get.mockResolvedValue(null);
      prisma.workspaceMember.count.mockResolvedValue(3);
      prisma.project.count.mockResolvedValue(5);
      prisma.task.groupBy.mockResolvedValue([
        { status: TaskStatus.TODO, _count: { _all: 2 } },
        { status: TaskStatus.DONE, _count: { _all: 4 } },
      ]);
      prisma.task.count.mockResolvedValue(1);
      prisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);

      const result = await service.getDashboard('user-1');

      expect(result).toEqual({
        workspaceCount: 3,
        projectCount: 5,
        tasksByStatus: {
          [TaskStatus.TODO]: 2,
          [TaskStatus.IN_PROGRESS]: 0,
          [TaskStatus.REVIEW]: 0,
          [TaskStatus.DONE]: 4,
        },
        overdueTaskCount: 1,
        recentTasks: [{ id: 'task-1' }],
      });
      expect(cache.set).toHaveBeenCalledWith('dashboard:user-1', result, 60);
    });
  });
});
