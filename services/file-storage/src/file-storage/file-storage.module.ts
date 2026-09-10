import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FileProcessingModule } from '../file-processing/file-processing.module.js';
import { FileStorageService } from './file-storage.service.js';
import { FileStorageController } from './file-storage.controller.js';
import { ExternalShareController } from './external-share.controller.js';

@Module({
  imports: [OutboxModule, StorageModule, FileProcessingModule, PrismaModule],
  controllers: [FileStorageController, ExternalShareController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'file-storage-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    FileStorageService,
  ],
  exports: [FileStorageService],
})
export class FileStorageModule {}
