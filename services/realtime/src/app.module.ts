import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { InboxModule } from './inbox/inbox.module.js';
import { EventsModule } from './events/events.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    InboxModule,
    RealtimeModule,
    EventsModule,
  ],
})
export class AppModule {}
