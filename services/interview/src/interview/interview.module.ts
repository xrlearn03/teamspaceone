import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AuthorizationClientService } from './authorization.client.js';
import { InterviewPermissionGuard } from './permission.guard.js';
import { AiClient } from './ai.client.js';
import { MeetingClient } from './meeting.client.js';
import { InterviewService } from './interview.service.js';
import { InterviewController } from './interview.controller.js';
import { PublicInterviewController } from './public-interview.controller.js';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [InterviewController, PublicInterviewController],
  providers: [AuthorizationClientService, InterviewPermissionGuard, AiClient, MeetingClient, InterviewService],
})
export class InterviewModule {}
