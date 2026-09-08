import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module.js';
import { SearchModule } from '../search/search.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NatsClientService } from './nats-client.service.js';
import { NatsConsumerService } from './nats-consumer.service.js';

@Module({
  imports: [InboxModule, PrismaModule, SearchModule],
  providers: [NatsClientService, NatsConsumerService],
  exports: [NatsClientService, NatsConsumerService],
})
export class EventsModule {}
