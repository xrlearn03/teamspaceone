import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LiveKitModule } from '../livekit/livekit.module.js';
import { MeetingService } from './meeting.service.js';
import { MeetingController } from './meeting.controller.js';

@Module({
  imports: [OutboxModule, LiveKitModule, PrismaModule],
  controllers: [MeetingController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'meeting-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    MeetingService,
  ],
  exports: [MeetingService],
})
export class MeetingModule {}
