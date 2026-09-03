import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NatsClientService } from './nats-client.service.js';
import { NatsConsumerService } from './nats-consumer.service.js';

@Module({
  imports: [InboxModule, RealtimeModule],
  providers: [NatsClientService, NatsConsumerService],
  exports: [NatsClientService],
})
export class EventsModule {}
