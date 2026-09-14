import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: {
    workspaceMember: { findUnique: jest.Mock };
    project: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspaceMember: { findUnique: jest.fn() },
      project: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('create', () => {
    it('rejects a caller who is not a workspace member', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'ws-1', { name: 'New Project' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates the project scoped to the workspace', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.project.create.mockResolvedValue({ id: 'proj-1' });

      await service.create('user-1', 'ws-1', { name: 'New Project', description: 'x' });

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: { name: 'New Project', description: 'x', workspaceId: 'ws-1' },
      });
      expect(cache.del).toHaveBeenCalledWith('workspace-stats:ws-1');
    });
  });

  describe('findAll', () => {
    it('excludes archived projects by default', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.project.findMany.mockResolvedValue([]);

      await service.findAll('user-1', 'ws-1', {});

      const args = prisma.project.findMany.mock.calls[0][0];
      expect(args.where.isArchived).toBe(false);
    });

    it('includes archived projects when requested', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.project.findMany.mockResolvedValue([]);

      await service.findAll('user-1', 'ws-1', { includeArchived: true });

      const args = prisma.project.findMany.mock.calls[0][0];
      expect(args.where.isArchived).toBeUndefined();
    });

    it('applies a case-insensitive name search filter', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.project.findMany.mockResolvedValue([]);

      await service.findAll('user-1', 'ws-1', { search: 'launch' });

      const args = prisma.project.findMany.mock.calls[0][0];
      expect(args.where.name).toEqual({ contains: 'launch', mode: 'insensitive' });
    });

    it('defaults to page 1 with a limit of 20', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(0);

      await service.findAll('user-1', 'ws-1', {});

      const args = prisma.project.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
    });

    it('paginates using the requested page and limit', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'VIEWER' });
      prisma.project.findMany.mockResolvedValue([{ id: 'p-1' }]);
      prisma.project.count.mockResolvedValue(45);

      const result = await service.findAll('user-1', 'ws-1', { page: 2, limit: 10 });

      const args = prisma.project.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      expect(result).toEqual({
        items: [{ id: 'p-1' }],
        total: 45,
        page: 2,
        limit: 10,
        totalPages: 5,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the project belongs to a different workspace', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-2' });

      await expect(service.findOne('user-1', 'ws-1', 'proj-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the project when it belongs to the workspace', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });

      const result = await service.findOne('user-1', 'ws-1', 'proj-1');

      expect(result).toEqual({ id: 'proj-1', workspaceId: 'ws-1' });
    });
  });

  describe('archive / restore', () => {
    it('sets isArchived true on archive', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.project.update.mockResolvedValue({ id: 'proj-1', isArchived: true });

      await service.archive('ws-1', 'proj-1');

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { isArchived: true },
      });
      expect(cache.del).toHaveBeenCalledWith('workspace-stats:ws-1');
    });

    it('sets isArchived false on restore', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });
      prisma.project.update.mockResolvedValue({ id: 'proj-1', isArchived: false });

      await service.restore('ws-1', 'proj-1');

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { isArchived: false },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for a project outside the workspace', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-2' });

      await expect(service.remove('ws-1', 'proj-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.project.delete).not.toHaveBeenCalled();
    });

    it('deletes the project when it belongs to the workspace', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' });

      await service.remove('ws-1', 'proj-1');

      expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'proj-1' } });
      expect(cache.del).toHaveBeenCalledWith('workspace-stats:ws-1');
    });
  });
});
