import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope, isEventEnvelope } from '@teamspace-one/event-contracts';
import { type PrismaClient, Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope): Promise<void> {
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
          subject: envelope.eventType,
          payload: envelope as any,
          organisationId: envelope.organisationId,
        },
      });
    });
  }

  private async processEvent(
    envelope: EventEnvelope,
    _tx: PrismaClient | Prisma.TransactionClient,
  ): Promise<void> {
    this.logger.log({ eventId: envelope.eventId, eventType: envelope.eventType }, 'Processing event');
  }
}
