import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { PrismaHealthIndicator } from './indicators/prisma-health.indicator';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';

// Heap ceiling for the liveness check - not a memory limit for the process,
// just the point past which we'd rather report unhealthy than keep serving.
const MAX_HEAP_BYTES = 300 * 1024 * 1024;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness/readiness check',
    description:
      'Verifies Postgres, Redis, and process memory are healthy. Unauthenticated.',
  })
  check() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', MAX_HEAP_BYTES),
    ]);
  }
}
