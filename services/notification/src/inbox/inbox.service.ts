import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export type EventHandler = (
  tx: Prisma.TransactionClient,
  envelope: EventEnvelope,
) => Promise<unknown> | unknown;

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope, handler: EventHandler): Promise<unknown> {
    if (!envelope.organisationId) {
      throw new Error('Event envelope missing organisationId');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      try {
        await tx.inboxEvent.create({
          data: {
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            subject: envelope.eventType,
            payload: envelope as any,
            organisationId: envelope.organisationId,
          },
        });
      } catch (err) {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2002') {
          this.logger.log({ eventId: envelope.eventId }, 'Duplicate event skipped');
          return undefined;
        }
        throw err;
      }

      return handler(tx, envelope);
    });
  }
}
