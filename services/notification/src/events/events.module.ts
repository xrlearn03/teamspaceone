import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { NatsClientService } from './nats-client.service.js';
import { NatsConsumerService } from './nats-consumer.service.js';

@Module({
  imports: [InboxModule, NotificationModule],
  providers: [NatsClientService, NatsConsumerService],
  exports: [NatsClientService],
})
export class EventsModule {}
