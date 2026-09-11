import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope, type PasswordResetRequestedPayload } from '@teamspace-one/event-contracts';
import { sendEmail } from './mailer.js';
import { OrganisationEmailProviderClient } from './organisation-email-provider.client.js';

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailProvider: OrganisationEmailProviderClient,
  ) {}

  async send(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as PasswordResetRequestedPayload;
    const { email, code } = payload;
    if (!email || !code) {
      this.logger.warn({ eventId: envelope.eventId }, 'Password reset event missing email or code');
      return;
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'https://teamspaceone.in';
    const subject = 'Reset your Teamspace One password';
    const body =
      'Hi,\n\n' +
      'A password reset was requested for your Teamspace One account.\n\n' +
      `Your 6-digit reset code is: ${code}\n\n` +
      'This code expires in 10 minutes.\n\n' +
      'If you did not request this, you can ignore this email.\n';

    const provider = envelope.actorId
      ? await this.emailProvider.getProviderForUser(envelope.actorId)
      : null;
    await sendEmail(this.config, { to: email, subject, body }, provider);
  }
}
