import { Injectable, Logger } from '@nestjs/common';
import { type EventEnvelope } from '@reactify/event-contracts';
import { type PrismaClient, type Prisma } from '#prisma';
import { NatsClientService } from '../events/nats-client.service.js';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly natsClient: NatsClientService) {}

  async createEvent(
    tx: Prisma.TransactionClient,
    envelope: EventEnvelope,
    subject: string,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        subject,
        payload: envelope as any,
        organisationId: envelope.organisationId,
      },
    });
  }

  async publishPending(prisma: PrismaClient): Promise<number> {
    const pending = await prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (pending.length === 0) return 0;

    const js = await this.natsClient.getJetStream();
    let published = 0;

    for (const event of pending) {
      try {
        await js.publish(event.subject, JSON.stringify(event.payload));
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
        published++;
      } catch (err) {
        this.logger.error(
          { eventId: event.eventId, error: (err as Error).message },
          'Failed to publish outbox event',
        );
      }
    }

    return published;
  }
}
