import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType } from '@prisma/client';
import {
  TASK_ASSIGNED_EVENT,
  TaskAssignedEvent,
  TASK_COMPLETED_EVENT,
  TaskCompletedEvent,
  COMMENT_ADDED_EVENT,
  CommentAddedEvent,
  USER_INVITED_EVENT,
  UserInvitedEvent,
} from '../../common/events';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  NotificationDeliveryJobData,
} from '../queue.constants';

/**
 * Bridges the domain event bus (feature/event-bus) to the notification
 * queue: each of the four events gets translated into one
 * notification-delivery job per recipient. This is the only place that
 * knows both "domain event" and "queue job" shapes.
 */
@Injectable()
export class NotificationEventsListener {
  constructor(
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly notificationQueue: Queue<NotificationDeliveryJobData>,
  ) {}

  @OnEvent(TASK_ASSIGNED_EVENT)
  async onTaskAssigned(event: TaskAssignedEvent) {
    await this.enqueue(event.assigneeId, NotificationType.TASK_ASSIGNED, {
      taskId: event.taskId,
      taskTitle: event.taskTitle,
      projectId: event.projectId,
      assignedById: event.assignedById,
    });
  }

  @OnEvent(TASK_COMPLETED_EVENT)
  async onTaskCompleted(event: TaskCompletedEvent) {
    await this.enqueue(event.reporterId, NotificationType.TASK_COMPLETED, {
      taskId: event.taskId,
      taskTitle: event.taskTitle,
      projectId: event.projectId,
      completedById: event.completedById,
    });
  }

  @OnEvent(COMMENT_ADDED_EVENT)
  async onCommentAdded(event: CommentAddedEvent) {
    await Promise.all(
      event.recipientIds.map((userId) =>
        this.enqueue(userId, NotificationType.COMMENT_ADDED, {
          commentId: event.commentId,
          taskId: event.taskId,
          taskTitle: event.taskTitle,
          authorId: event.authorId,
        }),
      ),
    );
  }

  @OnEvent(USER_INVITED_EVENT)
  async onUserInvited(event: UserInvitedEvent) {
    await this.enqueue(event.invitedUserId, NotificationType.USER_INVITED, {
      scope: event.scope,
      scopeId: event.scopeId,
      scopeName: event.scopeName,
      invitedById: event.invitedById,
      role: event.role,
    });
  }

  private enqueue(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ) {
    return this.notificationQueue.add('deliver', { userId, type, payload });
  }
}
