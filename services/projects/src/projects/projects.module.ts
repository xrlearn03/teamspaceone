import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthorizationClientService } from './authorization.client.js';
import { ProjectsService } from './projects.service.js';
import { ProjectsController } from './projects.controller.js';
import { TodosService } from './todos.service.js';
import { TodosController } from './todos.controller.js';
import { TimeEntriesService } from './time-entries.service.js';
import { TimeEntriesController } from './time-entries.controller.js';

@Module({
  imports: [OutboxModule, PrismaModule],
  controllers: [ProjectsController, TodosController, TimeEntriesController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'projects-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    AuthorizationClientService,
    ProjectsService,
    TodosService,
    TimeEntriesService,
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
