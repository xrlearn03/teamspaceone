import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope, type GuestInvitedPayload } from '@teamspace-one/event-contracts';

@Injectable()
export class GuestInvitationEmailService {
  private readonly logger = new Logger(GuestInvitationEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as GuestInvitedPayload;
    const to = payload.email;
    const token = payload.token;

    if (!to) {
      this.logger.warn({ eventId: envelope.eventId }, 'Guest invited event missing email');
      return;
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'https://app.teamspace.one';
    const acceptUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}`;

    const subject = 'You have been invited to join an organisation';
    const body =
      `Hi there,\n\n` +
      `You have been invited to join an organisation on Teamspace One.\n\n` +
      `To set your password and join, open the app and use this invitation token:\n\n` +
      `Token: ${token}\n\n` +
      `Or use this link:\n${acceptUrl}\n\n` +
      `This invitation will expire on ${new Date(payload.expiresAt).toLocaleString()}.\n`;

    await this.sendEmail({ to, subject, body });
  }

  private async sendEmail({ to, subject, body }: { to: string; subject: string; body: string }): Promise<void> {
    const webhookUrl = this.config.get<string>('EMAIL_WEBHOOK_URL');
    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, subject, body }),
      });
      if (!response.ok) {
        throw new Error(`Email webhook returned ${response.status}`);
      }
      this.logger.debug({ to }, 'Guest invitation sent via webhook');
      return;
    }

    const smtpHost = this.config.get<string>('SMTP_HOST');
    if (smtpHost) {
      const nodemailer = require('nodemailer') as any;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: this.config.get<number>('SMTP_PORT', 587),
        secure: this.config.get<boolean>('SMTP_SECURE', false),
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
      const from = this.config.get<string>('SMTP_FROM', 'no-reply@teamspace.one');
      await transporter.sendMail({ from, to, subject, text: body });
      this.logger.debug({ to }, 'Guest invitation sent via SMTP');
      return;
    }

    this.logger.log({ to, subject, body }, 'Email delivery not configured; logging guest invitation content');
  }
}
