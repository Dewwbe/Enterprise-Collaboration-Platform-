import { NotificationType, type Notification } from '@ecp/shared-types';

/**
 * Human-readable text per type, derived from each event listener's payload
 * shape (apps/api/src/queue/listeners/notification-events.listener.ts).
 * Broader than the two types apps/api emails (TASK_ASSIGNED, USER_INVITED)
 * since the in-app center should say something for all six.
 */
export function notificationMessage(notification: Notification): string {
  const p = notification.payload;
  switch (notification.type) {
    case NotificationType.TASK_ASSIGNED:
      return `You were assigned to "${p.taskTitle}".`;
    case NotificationType.TASK_COMPLETED:
      return `"${p.taskTitle}" was marked done.`;
    case NotificationType.COMMENT_ADDED:
      return `New comment on "${p.taskTitle}".`;
    case NotificationType.USER_INVITED:
      return `You were invited to ${p.scope} "${p.scopeName}" as ${p.role}.`;
    case NotificationType.TASK_DUE_REMINDER:
      return `"${p.taskTitle}" is due soon.`;
    case NotificationType.WEEKLY_SUMMARY:
      return `Weekly summary: ${p.assignedCount} assigned, ${p.completedCount} completed in the last ${p.periodDays} days.`;
    default:
      return 'You have a new notification.';
  }
}
