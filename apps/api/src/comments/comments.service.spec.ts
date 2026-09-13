import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: {
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
    it('creates the comment with the caller as author', async () => {
      prisma.comment.create.mockResolvedValue({ id: 'c-1' });

      await service.create('user-1', 'task-1', { body: 'hi' });

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: { taskId: 'task-1', authorId: 'user-1', body: 'hi' },
      });
    });
  });

  describe('update', () => {
    it('throws NotFoundException for a comment on a different task', async () => {
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
    it("rejects deleting someone else's comment even for the calling user's own role", async () => {
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
