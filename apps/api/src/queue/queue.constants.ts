import { NotificationType } from '@prisma/client';

export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery';
export const DAILY_REMINDER_QUEUE = 'daily-reminder';
export const WEEKLY_SUMMARY_QUEUE = 'weekly-summary';
export const CLEANUP_EXPIRED_TOKENS_QUEUE = 'cleanup-expired-tokens';

export interface NotificationDeliveryJobData {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}
