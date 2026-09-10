import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'audit-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    AuditService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
