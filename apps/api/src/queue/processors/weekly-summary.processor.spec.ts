import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationType } from '@prisma/client';
import { WeeklySummaryProcessor } from './weekly-summary.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queue.constants';

describe('WeeklySummaryProcessor', () => {
  let processor: WeeklySummaryProcessor;
  let prisma: { workspaceMember: { findMany: jest.Mock }; task: { count: jest.Mock } };
  let notificationQueue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspaceMember: { findMany: jest.fn() },
      task: { count: jest.fn() },
    };
    notificationQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklySummaryProcessor,
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE),
          useValue: notificationQueue,
        },
      ],
    }).compile();

    processor = module.get(WeeklySummaryProcessor);
  });

  it('queues a summary only for members with activity', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);
    prisma.task.count
      .mockResolvedValueOnce(3) // user-1 assigned
      .mockResolvedValueOnce(1) // user-1 completed
      .mockResolvedValueOnce(0) // user-2 assigned
      .mockResolvedValueOnce(0); // user-2 completed

    await processor.process();

    expect(notificationQueue.add).toHaveBeenCalledTimes(1);
    expect(notificationQueue.add).toHaveBeenCalledWith('deliver', {
      userId: 'user-1',
      type: NotificationType.WEEKLY_SUMMARY,
      payload: { assignedCount: 3, completedCount: 1, periodDays: 7 },
    });
  });
});
