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
      await this.processEvent(envelope, tx);

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
        const prismaError = err as { code?: string };
        if (prismaError.code === 'P2002') {
          this.logger.warn({ eventId: envelope.eventId }, 'Duplicate event skipped');
          return;
        }
        throw err;
      }
    });
  }

  private async processEvent(
    envelope: EventEnvelope,
    tx: PrismaClient | Prisma.TransactionClient,
  ): Promise<void> {
    this.logger.log({ eventId: envelope.eventId, eventType: envelope.eventType }, 'Processing event');

    if (envelope.eventType === 'teamspace-one.template.created') {
      const payload = envelope.payload as { name?: string } | undefined;
      if (payload?.name) {
        await tx.templateEntity.upsert({
          where: { id: envelope.resourceId },
          update: { name: payload.name },
          create: {
            id: envelope.resourceId,
            organisationId: envelope.organisationId,
            name: payload.name,
          },
        });
      }
    }
  }
}
