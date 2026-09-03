import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { OrganisationModule } from './organisation/organisation.module.js';
import { EventsModule } from './events/events.module.js';
import { OutboxModule } from './outbox/outbox.module.js';

function parseRedisUrl(url?: string) {
  if (!url) return { host: 'localhost', port: 6379 };
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.get<string>('REDIS_URL')),
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    HealthModule,
    EventsModule,
    OutboxModule,
    OrganisationModule,
  ],
})
export class AppModule {}
