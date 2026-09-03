import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { MessagingService } from './messaging.service.js';
import { MessagingController } from './messaging.controller.js';

@Module({
  imports: [OutboxModule],
  controllers: [MessagingController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
