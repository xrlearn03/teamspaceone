import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope, isEventEnvelope } from '@teamspace-one/event-contracts';
import { type PrismaClient, Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export type InboxEventHandler = (
  tx: Prisma.TransactionClient,
  envelope: EventEnvelope,
) => Promise<unknown>;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    envelope: EventEnvelope,
    subject = envelope.eventType,
    handler?: InboxEventHandler,
  ): Promise<void> {
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
      if (handler) {
        await handler(tx, envelope);
      }

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
    // HRMS currently consumes no external projections; events are recorded
    // for idempotency/audit only.
    void tx;
  }
}
