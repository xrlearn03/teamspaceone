import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboxModule } from '../outbox/outbox.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationService } from './notification.service.js';
import { NotificationController } from './notification.controller.js';
import { NotificationDeliveryWorker } from './notification.worker.js';

@Module({
  imports: [
    PrismaModule,
    OutboxModule,
    BullModule.registerQueue({ name: 'notification' }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationDeliveryWorker],
  exports: [NotificationService],
})
export class NotificationModule {}
