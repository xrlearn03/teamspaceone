import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { renderEmailHtml } from './templates.js';

@Processor('notification')
export class NotificationDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
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

  private async sendEmail(notification: { id: string; title: string; body: string; userId: string; eventType: string; link?: string | null; organisationId?: string; actorId?: string | null }): Promise<void> {
    const webhookUrl = this.config.get<string>('EMAIL_WEBHOOK_URL');
    if (webhookUrl) {
      const appUrl = this.config.get<string>('APP_URL', 'https://app.teamspace.one');
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: notification.userId,
          subject: notification.title,
          body: notification.body,
          html: renderEmailHtml({
            eventType: notification.eventType,
            title: notification.title,
            body: notification.body,
            link: notification.link,
            appUrl,
          }),
          notificationId: notification.id,
          eventType: notification.eventType,
        }),
      });
      if (!response.ok) {
        throw new Error(`Email webhook returned ${response.status}`);
      }
      this.logger.debug({ notificationId: notification.id, userId: notification.userId }, 'Email sent via webhook');
      return;
    }

    const smtpHost = this.config.get<string>('SMTP_HOST');
    if (smtpHost) {
      await this.sendEmailSmtp(notification);
      return;
    }

    this.logger.log(
      { notificationId: notification.id, userId: notification.userId, subject: notification.title, body: notification.body },
      'Email delivery not configured (set EMAIL_WEBHOOK_URL or SMTP_HOST). Logged email content.',
    );
  }

  private async sendEmailSmtp(notification: { id: string; title: string; body: string; userId: string; eventType: string; link?: string | null; organisationId?: string; actorId?: string | null }): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer') as any;
      const transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      const authUrl = this.config.get<string>('AUTH_SERVICE_URL');
      let to = this.config.get<string>('EMAIL_FALLBACK_TO');
      if (authUrl && !to) {
        const token = this.config.get<string>('AUTH_SERVICE_TOKEN');
        const internalKey = this.config.get<string>('INTERNAL_API_KEY');
        if (!internalKey) {
          throw new Error('INTERNAL_API_KEY environment variable is required');
        }
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-internal-api-key': internalKey,
          'x-internal-caller': 'notification-service',
        };
        if (token) headers.authorization = `Bearer ${token}`;
        if (notification.organisationId) headers['x-organisation-id'] = notification.organisationId;
        if (notification.actorId) headers['x-actor-id'] = notification.actorId;
        const response = await fetch(`${authUrl}/users/${encodeURIComponent(notification.userId)}`, { headers });
        if (response.ok) {
          const user = (await response.json()) as { email?: string };
          to = user?.email;
        }
      }
      if (!to) {
        this.logger.warn({ notificationId: notification.id, userId: notification.userId }, 'No recipient email available; falling back to console log');
        this.logger.log({ notificationId: notification.id, userId: notification.userId, subject: notification.title, body: notification.body }, 'Email content');
        return;
      }
      const appUrl = this.config.get<string>('APP_URL', 'https://app.teamspace.one');
      await transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM', 'no-reply@teamspace.one'),
        to,
        subject: notification.title,
        text: notification.body,
        html: renderEmailHtml({
          eventType: notification.eventType,
          title: notification.title,
          body: notification.body,
          link: notification.link,
          appUrl,
        }),
      });
    } catch (err) {
      this.logger.error({ notificationId: notification.id, error: (err as Error).message }, 'Failed to send email via SMTP');
      throw err;
    }
  }

  private async sendDesktop(notification: { id: string; title: string; body: string; userId: string }): Promise<void> {
    this.logger.debug(
      { notificationId: notification.id, userId: notification.userId },
      'Desktop notification emitted through realtime service',
    );
  }

  private async sendPush(notification: { id: string; title: string; body: string; userId: string; link?: string | null }): Promise<void> {
    const pushWebhookUrl = this.config.get<string>('PUSH_WEBHOOK_URL');
    if (!pushWebhookUrl) {
      this.logger.debug(
        { notificationId: notification.id, userId: notification.userId },
        'PUSH_WEBHOOK_URL not configured; skipping push delivery',
      );
      return;
    }

    const response = await fetch(pushWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: notification.userId,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        notificationId: notification.id,
      }),
    });

    if (!response.ok) {
      throw new Error(`Push webhook returned ${response.status}`);
    }

    this.logger.debug(
      { notificationId: notification.id, userId: notification.userId },
      'Push notification sent via webhook',
    );
  }
}
