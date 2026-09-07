import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import {
  AUTHORIZATION_OPTIONS,
  RemotePermissionGuard,
  type RemoteAuthorizationOptions,
} from '@teamspace-one/authorization/nest';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';
import { InterviewAiController } from './interview-ai.controller.js';
import { AiIngestionProcessor } from './ai-ingestion.processor.js';

@Module({
  imports: [PrismaModule, OutboxModule, BullModule.registerQueue({ name: 'ai-ingestion' })],
  controllers: [AiController, InterviewAiController],
  providers: [
    {
      provide: AUTHORIZATION_OPTIONS,
      useFactory: (config: ConfigService): RemoteAuthorizationOptions => ({
        serviceName: 'ai-service',
        organisationServiceUrl: config.get<string>('ORGANISATION_SERVICE_URL'),
        internalApiKey: config.get<string>('INTERNAL_API_KEY'),
      }),
      inject: [ConfigService],
    },
    RemotePermissionGuard,
    AiService,
    AiIngestionProcessor,
  ],
  exports: [AiService],
})
export class AiModule {}
