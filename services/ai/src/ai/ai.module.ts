import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';
import { InterviewAiController } from './interview-ai.controller.js';
import { AiIngestionProcessor } from './ai-ingestion.processor.js';

@Module({
  imports: [PrismaModule, OutboxModule, BullModule.registerQueue({ name: 'ai-ingestion' })],
  controllers: [AiController, InterviewAiController],
  providers: [AiService, AiIngestionProcessor],
  exports: [AiService],
})
export class AiModule {}
