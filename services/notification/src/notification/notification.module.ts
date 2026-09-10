import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationService } from './notification.service.js';
import { NotificationController } from './notification.controller.js';
import { NotificationDeliveryWorker } from './notification.worker.js';
import { PushService } from './push.service.js';
import { GuestInvitationEmailService } from './guest-invitation-email.service.js';
import { MemberInvitationEmailService } from './member-invitation-email.service.js';
import { InterviewCandidateInvitationEmailService } from './interview-candidate-invitation-email.service.js';
import { PasswordResetEmailService } from './password-reset-email.service.js';
import { OrganisationEmailProviderClient } from './organisation-email-provider.client.js';

@Module({
  imports: [
    PrismaModule,
    OutboxModule,
    BullModule.registerQueue({ name: 'notification' }),
  ],
  controllers: [NotificationController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'notification-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    NotificationService,
    NotificationDeliveryWorker,
    PushService,
    GuestInvitationEmailService,
    MemberInvitationEmailService,
    InterviewCandidateInvitationEmailService,
    PasswordResetEmailService,
    OrganisationEmailProviderClient,
  ],
  exports: [NotificationService, PushService, GuestInvitationEmailService, MemberInvitationEmailService, InterviewCandidateInvitationEmailService, PasswordResetEmailService, OrganisationEmailProviderClient],
})
export class NotificationModule {}
