import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { USER_INVITED_EVENT } from '../common/events';
import { TaskStatus } from '../common/enums/task-status.enum';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    workspaceMember: { count: jest.Mock; upsert: jest.Mock; findUnique: jest.Mock };
    project: { count: jest.Mock };
    task: { groupBy: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn() },
      workspaceMember: { count: jest.fn(), upsert: jest.fn(), findUnique: jest.fn() },
      project: { count: jest.fn() },
      task: { groupBy: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  describe('getStats', () => {
    const membership = { userId: 'user-1' };

    it('throws NotFoundException when the caller is not a member', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1', members: [] });

      await expect(service.getStats('user-1', 'ws-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('returns the cached value without querying the database', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        members: [membership],
      });
      cache.get.mockResolvedValue({ memberCount: 3, projectCount: 2, taskCounts: {} });

      const result = await service.getStats('user-1', 'ws-1');

      expect(result).toEqual({ memberCount: 3, projectCount: 2, taskCounts: {} });
      expect(prisma.workspaceMember.count).not.toHaveBeenCalled();
    });

    it('computes and caches stats on a cache miss', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: 'ws-1',
        members: [membership],
      });
      cache.get.mockResolvedValue(null);
      prisma.workspaceMember.count.mockResolvedValue(4);
      prisma.project.count.mockResolvedValue(2);
      prisma.task.groupBy.mockResolvedValue([
        { status: TaskStatus.TODO, _count: { _all: 3 } },
        { status: TaskStatus.DONE, _count: { _all: 5 } },
      ]);

      const result = await service.getStats('user-1', 'ws-1');

      expect(result).toEqual({
        memberCount: 4,
        projectCount: 2,
        taskCounts: {
          [TaskStatus.TODO]: 3,
          [TaskStatus.IN_PROGRESS]: 0,
          [TaskStatus.REVIEW]: 0,
          [TaskStatus.DONE]: 5,
        },
      });
      expect(cache.set).toHaveBeenCalledWith('workspace-stats:ws-1', result, 60);
    });
  });

  describe('inviteMember', () => {
    it('emits UserInvitedEvent scoped to the workspace', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      prisma.workspaceMember.upsert.mockResolvedValue({
        id: 'mem-1',
        role: 'MEMBER',
        workspace: { name: 'Product Eng' },
      });

      await service.inviteMember('ws-1', 'inviter-1', 'user-2', 'MEMBER' as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        USER_INVITED_EVENT,
        expect.objectContaining({
          scope: 'workspace',
          scopeId: 'ws-1',
          scopeName: 'Product Eng',
          invitedUserId: 'user-2',
          invitedById: 'inviter-1',
        }),
      );
    });
  });
});
