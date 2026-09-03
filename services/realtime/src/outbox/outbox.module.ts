import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { EventsModule } from '../events/events.module.js';
import { OutboxService } from './outbox.service.js';
import { OutboxProcessor } from './outbox.processor.js';
import { OutboxScheduler } from './outbox.scheduler.js';

@Module({
  imports: [PrismaModule, EventsModule, BullModule.registerQueue({ name: 'outbox' })],
  providers: [OutboxService, OutboxProcessor, OutboxScheduler],
  exports: [OutboxService],
})
export class OutboxModule {}
