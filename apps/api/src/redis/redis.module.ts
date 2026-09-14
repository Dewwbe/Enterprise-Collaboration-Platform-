import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          // Don't crash the app if Redis is briefly unavailable - CacheService
          // fails open, so a dropped connection should degrade caching, not
          // the API itself.
          maxRetriesPerRequest: 1,
          lazyConnect: false,
        }),
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class RedisModule {}
