import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '../../common/enums/task-status.enum';
import {
  DAILY_REMINDER_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  NotificationDeliveryJobData,
} from '../queue.constants';

/**
 * Runs on a repeatable schedule (see QueueSchedulerService). Finds
 * non-terminal tasks due within the next 24h or already overdue and queues a
 * TASK_DUE_REMINDER notification per assignee - delegated to the
 * notification-delivery queue rather than writing Notification rows
 * directly, so persistence/WS-push stays in one place.
 */
@Processor(DAILY_REMINDER_QUEUE)
export class DailyReminderProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly notificationQueue: Queue<NotificationDeliveryJobData>,
  ) {
    super();
  }

  async process(): Promise<void> {
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        dueDate: { lte: in24h },
        assigneeId: { not: null },
      },
      select: { id: true, title: true, dueDate: true, assigneeId: true },
    });

    await Promise.all(
      tasks.map((task) =>
        this.notificationQueue.add('deliver', {
          userId: task.assigneeId!,
          type: NotificationType.TASK_DUE_REMINDER,
          payload: { taskId: task.id, taskTitle: task.title, dueDate: task.dueDate },
        }),
      ),
    );
  }
}
