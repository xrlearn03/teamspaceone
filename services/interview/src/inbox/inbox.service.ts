import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Subjects, type EventEnvelope, isEventEnvelope } from '@teamspace-one/event-contracts';
import { type PrismaClient, Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope, subject = envelope.eventType): Promise<void> {
    if (!envelope.organisationId) {
      throw new Error('Event missing organisationId');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.inboxEvent.findUnique({
        where: { eventId: envelope.eventId },
      });

      if (existing) {
        this.logger.warn({ eventId: envelope.eventId }, 'Duplicate event skipped');
        return;
      }

      await this.processEvent(envelope, tx);

      await tx.inboxEvent.create({
        data: {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          subject,
          payload: envelope as any,
          organisationId: envelope.organisationId,
        },
      });
    });
  }

  private async processEvent(
    envelope: EventEnvelope,
    tx: PrismaClient | Prisma.TransactionClient,
  ): Promise<void> {
    this.logger.log({ eventId: envelope.eventId, eventType: envelope.eventType }, 'Processing event');

    switch (envelope.eventType) {
      case Subjects.MEETING_RECORDING_TRANSCRIPT_READY:
        await this.createPendingRecordingEvaluation(tx, envelope);
        break;
      default:
        break;
    }
  }

  private async createPendingRecordingEvaluation(
    tx: PrismaClient | Prisma.TransactionClient,
    envelope: EventEnvelope,
  ): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const sessionId = (payload.interviewSessionId ?? envelope.resourceId) as string;
    const session = await tx.interviewSession.findFirst({
      where: { id: sessionId, organisationId: envelope.organisationId },
    });
    if (!session) return;

    await tx.interviewEvaluation.upsert({
      where: { sessionId_evaluatorId: { sessionId, evaluatorId: 'ai-recording' } },
      create: {
        id: randomUUID(),
        organisationId: envelope.organisationId,
        sessionId,
        evaluatorId: 'ai-recording',
        source: 'recording',
        status: 'pending_transcript',
        aiMetadata: { meetingId: payload.meetingId, files: payload.files } as any,
      },
      update: {},
    });

    this.logger.log({ sessionId }, 'Created pending recording evaluation');
  }
}
