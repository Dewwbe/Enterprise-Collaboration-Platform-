import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('create', () => {
    it('persists a notification for the given user', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'n-1' });

      await service.create('user-1', NotificationType.TASK_ASSIGNED, { taskId: 't-1' });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: NotificationType.TASK_ASSIGNED,
          payload: { taskId: 't-1' },
        },
      });
    });
  });

  describe('findAllForUser', () => {
    it('filters to unread only when requested', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findAllForUser('user-1', { unreadOnly: true, page: 1, limit: 20 });

      const where = prisma.notification.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ userId: 'user-1', readAt: null });
    });

    it('paginates the results', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findAllForUser('user-1', { page: 1, limit: 20 });

      expect(result).toEqual({
        items: [{ id: 'n-1' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });

  describe('markRead', () => {
    it('throws NotFoundException for a notification owned by someone else', async () => {
      prisma.notification.findUnique.mockResolvedValue({ id: 'n-1', userId: 'user-2' });

      await expect(service.markRead('user-1', 'n-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('marks an unread notification as read', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n-1',
        userId: 'user-1',
        readAt: null,
      });
      prisma.notification.update.mockResolvedValue({ id: 'n-1', readAt: new Date() });

      await service.markRead('user-1', 'n-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { readAt: expect.any(Date) },
      });
    });

    it('is a no-op for an already-read notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n-1',
        userId: 'user-1',
        readAt: new Date(),
      });

      await service.markRead('user-1', 'n-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });
});
