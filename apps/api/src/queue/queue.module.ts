import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  DAILY_REMINDER_QUEUE,
  WEEKLY_SUMMARY_QUEUE,
  CLEANUP_EXPIRED_TOKENS_QUEUE,
} from './queue.constants';
import { NotificationEventsListener } from './listeners/notification-events.listener';
import { NotificationDeliveryProcessor } from './processors/notification-delivery.processor';
import { DailyReminderProcessor } from './processors/daily-reminder.processor';
import { WeeklySummaryProcessor } from './processors/weekly-summary.processor';
import { CleanupExpiredTokensProcessor } from './processors/cleanup-expired-tokens.processor';
import { QueueSchedulerService } from './queue-scheduler.service';

/**
 * Registers BullMQ against the same Redis instance used for caching, and
 * declares the four queues Section 11 (Background Jobs) calls for. Global so
 * any feature module can @InjectQueue(...) without re-importing this.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
        // Retry failed jobs (requirement doc Section 11) with exponential
        // backoff instead of hammering a transient failure immediately.
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 24 * 60 * 60 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: NOTIFICATION_DELIVERY_QUEUE },
      { name: DAILY_REMINDER_QUEUE },
      { name: WEEKLY_SUMMARY_QUEUE },
      { name: CLEANUP_EXPIRED_TOKENS_QUEUE },
    ),
    NotificationsModule,
  ],
  providers: [
    NotificationEventsListener,
    NotificationDeliveryProcessor,
    DailyReminderProcessor,
    WeeklySummaryProcessor,
    CleanupExpiredTokensProcessor,
    QueueSchedulerService,
  ],
  exports: [BullModule],
})
export class QueueModule {}
