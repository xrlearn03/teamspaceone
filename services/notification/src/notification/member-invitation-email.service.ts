import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope, type MemberInvitedPayload } from '@teamspace-one/event-contracts';
import { sendEmail } from './mailer.js';
import { OrganisationEmailProviderClient } from './organisation-email-provider.client.js';

@Injectable()
export class MemberInvitationEmailService {
  private readonly logger = new Logger(MemberInvitationEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailProvider: OrganisationEmailProviderClient,
  ) {}

  async send(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as MemberInvitedPayload;
    const to = payload.email;
    if (!to) {
      this.logger.warn({ eventId: envelope.eventId }, 'Member invited event missing email');
      return;
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'https://teamspace.teamspace.in';
    const orgName = payload.organisationName ?? 'an organisation';
    const roleName = payload.roleName?.replace(/_/g, ' ') ?? 'member';
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim();

    const subject = `Your Teamspace One account for ${orgName}`;
    const credentialBlock = payload.temporaryPassword
      ? `Your login credentials:\n\n` +
        `  Login: ${to}\n` +
        `  Temporary password: ${payload.temporaryPassword}\n\n` +
        `Sign in at ${appUrl} — you will be asked to set a new password on first login.\n`
      : `You already have a Teamspace One account. Sign in at ${appUrl} with this email address.\n`;

    const body =
      `Hi${name ? ` ${name}` : ''},\n\n` +
      `You have been added to ${orgName} on Teamspace One as ${roleName}.\n\n` +
      credentialBlock +
      `\nIf you were not expecting this, you can ignore this email.\n`;

    const provider = payload.organisationId ? await this.emailProvider.getProvider(payload.organisationId) : null;
    this.logger.log({ eventId: envelope.eventId, to, accountCreated: payload.accountCreated, hasTemporaryPassword: !!payload.temporaryPassword }, 'Sending member invitation email');
    await sendEmail(this.config, { to, subject, body }, provider);
  }
}
