import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Subjects, type EventEnvelope, isEventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope): Promise<void> {
    if (!envelope.organisationId) {
      throw new Error('Event missing organisationId');
    }

    if (!isEventEnvelope(envelope)) {
      throw new Error('Invalid event envelope');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.inboxEvent.findUnique({
        where: { eventId: envelope.eventId },
      });

      if (existing) {
        this.logger.warn({ eventId: envelope.eventId }, 'Duplicate event skipped');
        return;
      }

      await this.processEvent(tx, envelope);

      await tx.inboxEvent.create({
        data: {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          subject: envelope.eventType,
          payload: envelope as any,
          organisationId: envelope.organisationId,
        },
      });
    });
  }

  private async processEvent(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    this.logger.log(
      { eventId: envelope.eventId, eventType: envelope.eventType, organisationId: envelope.organisationId },
      'Processing event',
    );

    switch (envelope.eventType) {
      case 'teamspace-one.organisation.created':
      case 'teamspace-one.organisation.member_added':
      case 'teamspace-one.workspace.created':
      case 'teamspace-one.user.created':
        // Meeting service keeps these as read-only context for validation.
        // No local projection required for Phase 5.
        break;
      case Subjects.INTERVIEW_SESSION_SCHEDULED:
        await this.createInterviewMeeting(tx, envelope);
        break;
      default:
        this.logger.debug({ eventType: envelope.eventType }, 'No handler for event type');
    }
  }

  private async createInterviewMeeting(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const candidateName = String(payload.candidateName ?? 'Candidate');
    const jobTitle = String(payload.jobTitle ?? 'Unknown role');
    const participantIds = Array.isArray(payload.participantIds) ? (payload.participantIds as string[]).filter(Boolean) : [];
    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt as string) : null;

    const meeting = await tx.meeting.create({
      data: {
        id: randomUUID(),
        organisationId: envelope.organisationId,
        roomName: `interview-${randomUUID()}`,
        title: `Interview: ${candidateName} (${jobTitle})`,
        description: `Interview session for ${candidateName}`,
        type: 'interview',
        scheduledAt,
        status: 'scheduled',
        createdBy: envelope.actorId ?? participantIds[0] ?? '',
        interviewSessionId: payload.sessionId as string | undefined,
        participants: {
          create: participantIds.map((userId) => ({
            id: randomUUID(),
            organisationId: envelope.organisationId,
            userId,
          })),
        },
      },
    });

    this.logger.log({ meetingId: meeting.id, organisationId: envelope.organisationId }, 'Created interview meeting from schedule');
  }
}
