import { Module } from '@nestjs/common';
import { MetricsModule } from '@reactify/metrics';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InboxModule } from '../inbox/inbox.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { NatsClientService } from './nats-client.service.js';
import { NatsConsumerService } from './nats-consumer.service.js';
import { DeadLetterService } from './dead-letter.service.js';
import { DeadLetterController } from './dead-letter.controller.js';
import { ReplayService } from './replay.service.js';
import { ReplayController } from './replay.controller.js';

@Module({
  imports: [PrismaModule, InboxModule, AuditModule, MetricsModule],
  controllers: [DeadLetterController, ReplayController],
  providers: [NatsClientService, NatsConsumerService, DeadLetterService, ReplayService],
  exports: [NatsClientService, DeadLetterService, ReplayService],
})
export class EventsModule {}
