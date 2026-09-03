import { Module, Global } from '@nestjs/common';
import { NatsClientService } from './nats-client.service.js';
import { NatsSetupService } from './nats-setup.service.js';

@Global()
@Module({
  providers: [NatsClientService, NatsSetupService],
  exports: [NatsClientService],
})
export class NatsClientModule {}
