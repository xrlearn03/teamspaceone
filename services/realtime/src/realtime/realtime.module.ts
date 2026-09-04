import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { AccessService } from './access.service.js';
import { PresenceService } from './presence.service.js';

@Module({
  imports: [PrismaModule],
  providers: [RealtimeGateway, AccessService, PresenceService],
  exports: [RealtimeGateway, AccessService, PresenceService],
})
export class RealtimeModule {}
