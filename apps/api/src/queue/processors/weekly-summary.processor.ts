import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '../../common/enums/task-status.enum';
import {
  WEEKLY_SUMMARY_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  NotificationDeliveryJobData,
} from '../queue.constants';

/**
 * Runs weekly (see QueueSchedulerService). Aggregates, per workspace member,
 * tasks assigned to and completed by them in the last 7 days, and queues one
 * WEEKLY_SUMMARY notification per member who had any activity.
 */
@Processor(WEEKLY_SUMMARY_QUEUE)
export class WeeklySummaryProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly notificationQueue: Queue<NotificationDeliveryJobData>,
  ) {
    super();
  }

  async process(): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const members = await this.prisma.workspaceMember.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });

    await Promise.all(
      members.map(async (member) => {
        const [assignedCount, completedCount] = await Promise.all([
          this.prisma.task.count({
            where: { assigneeId: member.userId, createdAt: { gte: since } },
          }),
          this.prisma.task.count({
            where: {
              assigneeId: member.userId,
              status: TaskStatus.DONE,
              updatedAt: { gte: since },
            },
          }),
        ]);

        if (assignedCount === 0 && completedCount === 0) {
          return;
        }

        await this.notificationQueue.add('deliver', {
          userId: member.userId,
          type: NotificationType.WEEKLY_SUMMARY,
          payload: { assignedCount, completedCount, periodDays: 7 },
        });
      }),
    );
  }
}
