import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope, type MemberInvitedPayload } from '@teamspace-one/event-contracts';
import { sendEmail } from './mailer.js';

@Injectable()
export class MemberInvitationEmailService {
  private readonly logger = new Logger(MemberInvitationEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as MemberInvitedPayload;
    const to = payload.email;
    if (!to) {
      this.logger.warn({ eventId: envelope.eventId }, 'Member invited event missing email');
      return;
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'https://app.teamspace.one';
    const orgName = payload.organisationName ?? 'an organisation';
    const roleName = payload.roleName?.replace(/_/g, ' ') ?? 'member';
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim();

    const subject = `Your Teamspace One account for ${orgName}`;
    const body =
      `Hi${name ? ` ${name}` : ''},\n\n` +
      `You have been added to ${orgName} on Teamspace One as ${roleName}.\n\n` +
      (payload.accountCreated && payload.temporaryPassword
        ? `Your login credentials:\n\n` +
          `  Login: ${to}\n` +
          `  Temporary password: ${payload.temporaryPassword}\n\n` +
          `Sign in at ${appUrl} — you will be asked to set a new password on first login.\n`
        : `Sign in at ${appUrl} with your existing Teamspace One account.\n`) +
      `\nIf you were not expecting this, you can ignore this email.\n`;

    await sendEmail(this.config, { to, subject, body });
  }
}
