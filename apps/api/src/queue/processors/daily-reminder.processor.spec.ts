import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationType } from '@prisma/client';
import { DailyReminderProcessor } from './daily-reminder.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_DELIVERY_QUEUE } from '../queue.constants';

describe('DailyReminderProcessor', () => {
  let processor: DailyReminderProcessor;
  let prisma: { task: { findMany: jest.Mock } };
  let notificationQueue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = { task: { findMany: jest.fn() } };
    notificationQueue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyReminderProcessor,
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE),
          useValue: notificationQueue,
        },
      ],
    }).compile();

    processor = module.get(DailyReminderProcessor);
  });

  it('queues a TASK_DUE_REMINDER notification per due/overdue assigned task', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 't-1', title: 'Task 1', dueDate: new Date(), assigneeId: 'user-1' },
      { id: 't-2', title: 'Task 2', dueDate: new Date(), assigneeId: 'user-2' },
    ]);

    await processor.process();

    expect(notificationQueue.add).toHaveBeenCalledTimes(2);
    expect(notificationQueue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({
        userId: 'user-1',
        type: NotificationType.TASK_DUE_REMINDER,
      }),
    );
  });

  it('does nothing when no tasks are due', async () => {
    prisma.task.findMany.mockResolvedValue([]);

    await processor.process();

    expect(notificationQueue.add).not.toHaveBeenCalled();
  });
});
