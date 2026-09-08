import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'search-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    SearchService,
  ],
  exports: [AUTHORIZATION_OPTIONS, RemotePermissionGuard, SearchService],
})
export class SearchModule {}
