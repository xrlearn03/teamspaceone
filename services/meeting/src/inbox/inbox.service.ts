import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope, isEventEnvelope } from '@reactify/event-contracts';
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

      await this.processEvent(envelope);

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

  private async processEvent(envelope: EventEnvelope): Promise<void> {
    this.logger.log(
      { eventId: envelope.eventId, eventType: envelope.eventType, organisationId: envelope.organisationId },
      'Processing event',
    );

    switch (envelope.eventType) {
      case 'reactify.organisation.created':
      case 'reactify.organisation.member_added':
      case 'reactify.workspace.created':
      case 'reactify.user.created':
        // Meeting service keeps these as read-only context for validation.
        // No local projection required for Phase 5.
        break;
      default:
        this.logger.debug({ eventType: envelope.eventType }, 'No handler for event type');
    }
  }
}
