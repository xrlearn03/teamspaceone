import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { AiModule } from '../ai/ai.module.js';
import { NatsClientService } from './nats-client.service.js';
import { NatsConsumerService } from './nats-consumer.service.js';

@Module({
  imports: [InboxModule, AiModule],
  providers: [NatsClientService, NatsConsumerService],
  exports: [NatsClientService],
})
export class EventsModule {}
