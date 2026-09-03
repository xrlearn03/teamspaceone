import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NatsModule } from '../events/nats.module.js';
import { OutboxService } from './outbox.service.js';
import { OutboxProcessor } from './outbox.processor.js';
import { OutboxScheduler } from './outbox.scheduler.js';

@Module({
  imports: [PrismaModule, NatsModule, BullModule.registerQueue({ name: 'outbox' })],
  providers: [OutboxService, OutboxProcessor, OutboxScheduler],
  exports: [OutboxService],
})
export class OutboxModule {}
