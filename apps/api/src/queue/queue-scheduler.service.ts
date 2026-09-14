import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DAILY_REMINDER_QUEUE,
  WEEKLY_SUMMARY_QUEUE,
  CLEANUP_EXPIRED_TOKENS_QUEUE,
} from './queue.constants';

const CLEANUP_EXPIRED_TOKENS_CRON = '0 3 * * *'; // daily at 03:00, off-peak

/**
 * Registers the three repeatable (cron-scheduled) jobs once at startup.
 * BullMQ dedupes repeatable jobs by their (queue, jobId, pattern) key, so
 * calling add() again on every app restart is idempotent - it does not
 * create duplicate schedules.
 */
@Injectable()
export class QueueSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(DAILY_REMINDER_QUEUE) private readonly dailyReminderQueue: Queue,
    @InjectQueue(WEEKLY_SUMMARY_QUEUE) private readonly weeklySummaryQueue: Queue,
    @InjectQueue(CLEANUP_EXPIRED_TOKENS_QUEUE) private readonly cleanupQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.dailyReminderQueue.add(
      'run',
      {},
      {
        repeat: { pattern: this.configService.get<string>('queue.dailyReminderCron')! },
        jobId: 'daily-reminder',
      },
    );
    await this.weeklySummaryQueue.add(
      'run',
      {},
      {
        repeat: { pattern: this.configService.get<string>('queue.weeklySummaryCron')! },
        jobId: 'weekly-summary',
      },
    );
    await this.cleanupQueue.add(
      'run',
      {},
      { repeat: { pattern: CLEANUP_EXPIRED_TOKENS_CRON }, jobId: 'cleanup-expired-tokens' },
    );
  }
}
