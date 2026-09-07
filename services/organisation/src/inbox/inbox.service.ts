import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { type Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export type InboxHandler = (
  tx: Prisma.TransactionClient,
  envelope: EventEnvelope,
) => Promise<unknown>;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent event handling: records the event in the inbox and invokes the
   * handler inside the same transaction. Duplicate deliveries are skipped.
   */
  async handle(envelope: EventEnvelope, handler: InboxHandler): Promise<unknown> {
    if (!envelope.organisationId) {
      throw new Error('Event missing organisationId');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.inboxEvent.findUnique({
        where: { eventId: envelope.eventId },
      });

      if (existing) {
        this.logger.warn({ eventId: envelope.eventId }, 'Duplicate event skipped');
        return null;
      }

      const result = await handler(tx, envelope);

      await tx.inboxEvent.create({
        data: {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          subject: envelope.eventType,
          payload: envelope as any,
          organisationId: envelope.organisationId,
        },
      });

      return result;
    });
  }
}
