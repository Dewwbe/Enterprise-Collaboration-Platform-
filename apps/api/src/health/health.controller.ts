import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { PrismaHealthIndicator } from './indicators/prisma-health.indicator';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness/readiness check',
    description:
      'Verifies Postgres, Redis, and process memory are healthy. Unauthenticated.',
  })
  check() {
    // Heap ceiling for the liveness check - not a memory limit for the
    // process, just the point past which we'd rather report unhealthy than
    // keep serving. Configurable (HEALTH_MAX_HEAP_BYTES) because CI runs this
    // in the same Jest process as the full unit + coverage suite, which
    // legitimately sits higher than a freshly started server.
    const maxHeapBytes = this.config.get<number>('health.maxHeapBytes')!;

    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', maxHeapBytes),
    ]);
  }
}
