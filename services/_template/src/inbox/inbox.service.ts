import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope, isEventEnvelope } from '@reactify/event-contracts';
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

    if (envelope.eventType === 'reactify.template.created') {
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
