import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';

@Module({
  imports: [OutboxModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
