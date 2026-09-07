import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope, type PasswordResetRequestedPayload } from '@teamspace-one/event-contracts';
import { sendEmail } from './mailer.js';

@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as PasswordResetRequestedPayload;
    const { email, token } = payload;
    if (!email || !token) {
      this.logger.warn({ eventId: envelope.eventId }, 'Password reset event missing email or token');
      return;
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'https://app.teamspace.one';
    const subject = 'Reset your Teamspace One password';
    const body =
      'Hi,\n\n' +
      'A password reset was requested for your Teamspace One account.\n\n' +
      `Paste this token in the app to set a new password:\n\n  ${token}\n\n` +
      'This token expires in 15 minutes.\n\n' +
      'If you did not request this, you can ignore this email.\n';

    await sendEmail(this.config, { to: email, subject, body });
  }
}
