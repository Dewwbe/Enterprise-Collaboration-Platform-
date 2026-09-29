import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorkspaceScopeResolver } from './workspace-scope-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('WorkspaceScopeResolver', () => {
  let resolver: WorkspaceScopeResolver;
  let prisma: {
    project: { findUnique: jest.Mock };
    task: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findUnique: jest.fn() },
      task: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkspaceScopeResolver, { provide: PrismaService, useValue: prisma }],
    }).compile();

    resolver = module.get<WorkspaceScopeResolver>(WorkspaceScopeResolver);
  });

  it('resolves directly from :workspaceId without touching the database', async () => {
    const result = await resolver.resolve({ workspaceId: 'ws-1' });

    expect(result).toEqual({ workspaceId: 'ws-1' });
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(prisma.task.findUnique).not.toHaveBeenCalled();
  });

  describe('via :projectId', () => {
    it('throws NotFoundException when the project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(resolver.resolve({ projectId: 'proj-1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves the workspace id via the project', async () => {
      prisma.project.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

      const result = await resolver.resolve({ projectId: 'proj-1' });

      expect(result).toEqual({ workspaceId: 'ws-1', projectId: 'proj-1' });
    });
  });

  describe('via :taskId', () => {
    it('throws NotFoundException when the task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(resolver.resolve({ taskId: 'task-1' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves the workspace id via task -> project', async () => {
      prisma.task.findUnique.mockResolvedValue({
        projectId: 'proj-1',
        project: { workspaceId: 'ws-1' },
      });

      const result = await resolver.resolve({ taskId: 'task-1' });

      expect(result).toEqual({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        taskId: 'task-1',
      });
    });

    it('throws NotFoundException when the task does not belong to the given :projectId', async () => {
      prisma.task.findUnique.mockResolvedValue({
        projectId: 'proj-2',
        project: { workspaceId: 'ws-1' },
      });

      await expect(
        resolver.resolve({ projectId: 'proj-1', taskId: 'task-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('takes priority over :projectId when both are present', async () => {
      prisma.task.findUnique.mockResolvedValue({
        projectId: 'proj-1',
        project: { workspaceId: 'ws-1' },
      });

      await resolver.resolve({ projectId: 'proj-1', taskId: 'task-1' });

      expect(prisma.project.findUnique).not.toHaveBeenCalled();
    });
  });

  it('throws NotFoundException when no recognized route param is present', async () => {
    await expect(resolver.resolve({})).rejects.toBeInstanceOf(NotFoundException);
  });
});
