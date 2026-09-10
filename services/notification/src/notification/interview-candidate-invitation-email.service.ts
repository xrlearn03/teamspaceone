import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { sendEmail } from './mailer.js';
import { OrganisationEmailProviderClient } from './organisation-email-provider.client.js';
import { renderEmailHtml } from './templates.js';

interface InterviewSessionScheduledPayload {
  candidateEmail?: string;
  candidateName?: string;
  jobTitle?: string;
  scheduledAt?: string;
  durationMin?: number;
  interviewType?: string;
  sessionId?: string;
  candidateId?: string;
}

@Injectable()
export class InterviewCandidateInvitationEmailService {
  private readonly logger = new Logger(InterviewCandidateInvitationEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailProvider: OrganisationEmailProviderClient,
  ) {}

  async send(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as InterviewSessionScheduledPayload;
    const to = payload.candidateEmail?.trim().toLowerCase();
    if (!to) {
      this.logger.warn(
        { eventId: envelope.eventId, sessionId: payload.sessionId },
        'Interview session scheduled event missing candidate email',
      );
      return;
    }

    const appUrl = this.config.get<string>('APP_URL') ?? 'https://teamspaceone.in';
    const candidateName = payload.candidateName?.trim() || 'Candidate';
    const jobTitle = payload.jobTitle?.trim() || 'the position';
    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    const durationMin = payload.durationMin ?? 60;
    const interviewType = (payload.interviewType ?? 'video').toLowerCase();

    const formattedDate =
      scheduledAt && !Number.isNaN(scheduledAt.getTime())
        ? scheduledAt.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
        : 'TBD — we will confirm shortly';

    const subject = `Interview invitation for ${jobTitle}`;

    const body =
      `Hi ${candidateName},\n\n` +
      `You have been invited to an interview for the ${jobTitle} position with Teamspace One.\n\n` +
      `Interview type: ${interviewType}\n` +
      `Scheduled: ${formattedDate}\n` +
      `Duration: ${durationMin} minutes\n\n` +
      `Please be ready at the scheduled time. Join details will be shared with you shortly.\n\n` +
      `Best regards,\nTeamspace One`;

    const html = renderEmailHtml({
      eventType: envelope.eventType,
      title: subject,
      body,
      appUrl,
    });

    const provider = envelope.organisationId
      ? await this.emailProvider.getProvider(envelope.organisationId)
      : null;

    this.logger.log(
      { eventId: envelope.eventId, to, sessionId: payload.sessionId, candidateId: payload.candidateId },
      'Sending interview candidate invitation email',
    );

    await sendEmail(this.config, { to, subject, body, html }, provider);
  }
}
