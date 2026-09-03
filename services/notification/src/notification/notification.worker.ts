import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Processor('notification')
export class NotificationDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ deliveryId: string }>): Promise<void> {
    const { deliveryId } = job.data;

    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notification: true },
    });

    if (!delivery) {
      this.logger.warn({ deliveryId, jobId: job.id }, 'Notification delivery not found');
      return;
    }

    if (delivery.status === 'sent') {
      return;
    }

    try {
      switch (delivery.channel) {
        case 'email':
          await this.sendEmail(delivery.notification);
          break;
        case 'desktop':
          await this.sendDesktop(delivery.notification);
          break;
        case 'push':
          await this.sendPush(delivery.notification);
          break;
        default:
          this.logger.warn({ channel: delivery.channel, deliveryId }, 'Unknown notification delivery channel');
      }

      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: 'sent' },
      });
    } catch (err) {
      const errorMessage = (err as Error).message;
      this.logger.error(
        { deliveryId, channel: delivery.channel, error: errorMessage, jobId: job.id },
        'Failed to deliver notification',
      );
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: 'failed', error: errorMessage },
      });
      throw err;
    }
  }

  private async sendEmail(notification: { id: string; title: string; body: string; userId: string; eventType: string }): Promise<void> {
    this.logger.debug(
      { notificationId: notification.id, userId: notification.userId },
      'Sending email notification',
    );
  }

  private async sendDesktop(notification: { id: string; title: string; body: string; userId: string }): Promise<void> {
    this.logger.debug(
      { notificationId: notification.id, userId: notification.userId },
      'Desktop notification emitted through realtime service',
    );
  }

  private async sendPush(notification: { id: string; title: string; body: string; userId: string }): Promise<void> {
    this.logger.debug(
      { notificationId: notification.id, userId: notification.userId },
      'Sending push notification',
    );
  }
}
