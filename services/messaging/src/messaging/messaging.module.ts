import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MessagingService } from './messaging.service.js';
import { MessagingController } from './messaging.controller.js';

@Module({
  imports: [OutboxModule, PrismaModule],
  controllers: [MessagingController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'messaging-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    MessagingService,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
