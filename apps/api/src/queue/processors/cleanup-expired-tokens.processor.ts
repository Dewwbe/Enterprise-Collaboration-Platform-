import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CLEANUP_EXPIRED_TOKENS_QUEUE } from '../queue.constants';

const REVOKED_RETENTION_DAYS = 30;

/**
 * Runs daily (see QueueSchedulerService). Deletes RefreshToken rows that are
 * no longer useful for anything - already expired, or revoked long enough
 * ago that keeping them around has no audit/security value - so the table
 * doesn't grow unbounded under the rotate-on-every-refresh strategy.
 */
@Processor(CLEANUP_EXPIRED_TOKENS_QUEUE)
export class CleanupExpiredTokensProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanupExpiredTokensProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(): Promise<void> {
    const revokedCutoff = new Date(
      Date.now() - REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: revokedCutoff } }],
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired/stale refresh token(s).`);
  }
}
