import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export type EventHandler = (envelope: EventEnvelope) => Promise<void> | void;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope, handler: EventHandler): Promise<void> {
    if (!envelope.organisationId) {
      throw new Error('Event envelope missing organisationId');
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.inboxEvent.findUnique({
        where: { eventId: envelope.eventId },
      });
      if (existing) {
        this.logger.log({ eventId: envelope.eventId }, 'Duplicate event skipped');
        return;
      }

      await tx.inboxEvent.create({
        data: {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          subject: envelope.eventType,
          payload: envelope as any,
          organisationId: envelope.organisationId,
        },
      });

      await handler(envelope);
    });
  }
}
