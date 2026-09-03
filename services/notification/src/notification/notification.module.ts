import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module.js';
import { NotificationService } from './notification.service.js';
import { NotificationController } from './notification.controller.js';

@Module({
  imports: [OutboxModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
