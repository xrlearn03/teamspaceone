import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope, type GuestInvitedPayload } from '@teamspace-one/event-contracts';
import { sendEmail } from './mailer.js';

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

    await sendEmail(this.config, { to, subject, body });
  }
}
