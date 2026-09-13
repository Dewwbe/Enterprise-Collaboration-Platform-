import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceRole } from '../common/enums/workspace-role.enum';

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: {
    task: { findUnique: jest.Mock };
    workspaceMember: { findUnique: jest.Mock };
    comment: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      task: { findUnique: jest.fn() },
      workspaceMember: { findUnique: jest.fn() },
      comment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  describe('create', () => {
    it('throws NotFoundException when the task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'task-1', { body: 'hi' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a VIEWER from commenting', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.VIEWER });

      await expect(
        service.create('user-1', 'task-1', { body: 'hi' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates the comment with the caller as author', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.comment.create.mockResolvedValue({ id: 'c-1' });

      await service.create('user-1', 'task-1', { body: 'hi' });

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { taskId: 'task-1', authorId: 'user-1', body: 'hi' },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a comment on a different task', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        taskId: 'task-2',
        authorId: 'user-1',
      });

      await expect(
        service.update('user-1', 'task-1', 'c-1', { body: 'edit' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects editing someone else's comment", async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        taskId: 'task-1',
        authorId: 'user-2',
      });

      await expect(
        service.update('user-1', 'task-1', 'c-1', { body: 'edit' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the author to edit their own comment', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        taskId: 'task-1',
        authorId: 'user-1',
      });
      prisma.comment.update.mockResolvedValue({ id: 'c-1', body: 'edit' });

      await service.update('user-1', 'task-1', 'c-1', { body: 'edit' });

      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { body: 'edit' },
      });
    });
  });

  describe('remove', () => {
    it("rejects deleting someone else's comment even for an ADMIN", async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.ADMIN });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        taskId: 'task-1',
        authorId: 'user-2',
      });

      await expect(service.remove('user-1', 'task-1', 'c-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.comment.delete).not.toHaveBeenCalled();
    });

    it('allows the author to delete their own comment', async () => {
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        project: { workspaceId: 'ws-1' },
      });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        taskId: 'task-1',
        authorId: 'user-1',
      });

      await service.remove('user-1', 'task-1', 'c-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });
  });
});
