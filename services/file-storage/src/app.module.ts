import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { EventsModule } from './events/events.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { FileStorageModule } from './file-storage/file-storage.module.js';
import { FileProcessingModule } from './file-processing/file-processing.module.js';

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
    FileStorageModule,
    FileProcessingModule,
  ],
})
export class AppModule {}
