import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { NatsModule } from './nats.module.js';
import { NatsConsumerService } from './nats-consumer.service.js';

@Module({
  imports: [NatsModule, InboxModule, NotificationModule],
  providers: [NatsConsumerService],
  exports: [NatsModule],
})
export class EventsModule {}
