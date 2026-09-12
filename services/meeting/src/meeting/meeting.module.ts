import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MeetingService } from './meeting.service.js';
import { MeetingScheduler } from './meeting.scheduler.js';
import { MeetingController } from './meeting.controller.js';
import { InternalMeetingController } from './internal-meeting.controller.js';
import { PublicMeetingController } from './public-meeting.controller.js';

@Module({
  imports: [OutboxModule, PrismaModule],
  controllers: [MeetingController, InternalMeetingController, PublicMeetingController],
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
    MeetingScheduler,
  ],
  exports: [MeetingService],
})
export class MeetingModule {}
