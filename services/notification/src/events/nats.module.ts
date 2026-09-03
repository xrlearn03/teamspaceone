import { Module } from '@nestjs/common';
import { NatsClientService } from './nats-client.service.js';

@Module({
  providers: [NatsClientService],
  exports: [NatsClientService],
})
export class NatsModule {}
