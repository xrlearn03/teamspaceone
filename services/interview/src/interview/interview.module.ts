import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AuthorizationClientService } from './authorization.client.js';
import { InterviewPermissionGuard } from './permission.guard.js';
import { AiClient } from './ai.client.js';
import { InterviewService } from './interview.service.js';
import { InterviewController } from './interview.controller.js';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [InterviewController],
  providers: [AuthorizationClientService, InterviewPermissionGuard, AiClient, InterviewService],
})
export class InterviewModule {}
