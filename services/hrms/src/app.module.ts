import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { HrmsModule } from './hrms/hrms.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { InboxModule } from './inbox/inbox.module.js';
import { EventsModule } from './events/events.module.js';
import { InterviewHiredConsumer } from './events/interview-hired.consumer.js';

function parseRedisUrl(url?: string) {
  if (!url) return { host: 'localhost', port: 6379 };
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
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
    InboxModule,
    OutboxModule,
    HrmsModule,
  ],
  // Registered here (not EventsModule) to avoid the HrmsModule → OutboxModule
  // → EventsModule → HrmsModule module cycle — AppModule already imports every
  // module this consumer needs providers from.
  providers: [InterviewHiredConsumer],
})
export class AppModule {}
