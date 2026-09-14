import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { EmailService } from '../../email/email.service';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  NotificationDeliveryJobData,
} from '../queue.constants';

/**
 * Only these two notification types also trigger an email - matching
 * PROJECT_PLAN.md's explicit scope, not every notification (a comment on
 * every task would be spam).
 */
const EMAIL_NOTIFIED_TYPES: NotificationType[] = [
  NotificationType.TASK_ASSIGNED,
  NotificationType.USER_INVITED,
];

@Processor(NOTIFICATION_DELIVERY_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job<NotificationDeliveryJobData>): Promise<void> {
    const { userId, type, payload } = job.data;

    const notification = await this.notificationsService.create(userId, type, payload);
    this.notificationsGateway.pushToUser(userId, notification);

    if (EMAIL_NOTIFIED_TYPES.includes(type)) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user) {
        await this.emailService.sendMail({
          to: user.email,
          subject: this.subjectFor(type),
          html: this.htmlFor(type, payload),
        });
      }
    }
  }

  private subjectFor(type: NotificationType): string {
    switch (type) {
      case NotificationType.TASK_ASSIGNED:
        return 'You were assigned a task';
      case NotificationType.USER_INVITED:
        return "You've been invited";
      default:
        return 'New notification';
    }
  }

  private htmlFor(type: NotificationType, payload: Record<string, unknown>): string {
    if (type === NotificationType.TASK_ASSIGNED) {
      return `<p>You were assigned to task "<strong>${this.escape(payload.taskTitle)}</strong>".</p>`;
    }
    if (type === NotificationType.USER_INVITED) {
      return `<p>You were invited to ${this.escape(payload.scope)} "<strong>${this.escape(
        payload.scopeName,
      )}</strong>" as ${this.escape(payload.role)}.</p>`;
    }
    return '<p>You have a new notification.</p>';
  }

  private escape(value: unknown): string {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
    );
  }
}
