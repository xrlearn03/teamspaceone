import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { type EventEnvelope } from '@reactify/event-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { NatsClientService } from './nats-client.service.js';

export interface DeadLetterPayload {
  eventId?: string;
  eventType?: string;
  originalEvent?: EventEnvelope | unknown;
  envelope?: EventEnvelope | unknown;
  reason?: string;
  service?: string;
  deliveryCount?: number;
  organisationId?: string;
  [key: string]: unknown;
}

function isEventEnvelopeLike(value: unknown): value is EventEnvelope {
  const e = value as Partial<EventEnvelope> | undefined;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.eventId === 'string' &&
    typeof e.eventType === 'string' &&
    typeof e.occurredAt === 'string' &&
    typeof e.organisationId === 'string' &&
    typeof e.resourceType === 'string' &&
    typeof e.resourceId === 'string'
  );
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsClientService,
  ) {}

  isDeadLetterSubject(subject: string): boolean {
    return subject.startsWith('reactify.dead-letter.') || subject.startsWith('reactify.dlq.');
  }

  async store(subject: string, raw: DeadLetterPayload): Promise<void> {
    const original = this.extractOriginalEvent(raw);
    const organisationId = isEventEnvelopeLike(original)
      ? original.organisationId
      : raw.organisationId;

    await this.prisma.deadLetterEvent.create({
      data: {
        eventId: isEventEnvelopeLike(original) ? original.eventId : raw.eventId ?? null,
        eventType: isEventEnvelopeLike(original) ? original.eventType : raw.eventType ?? null,
        subject,
        originalEvent: original as any,
        reason: raw.reason ?? 'unknown',
        service: raw.service ?? null,
        deliveryCount: raw.deliveryCount ?? 0,
        payload: raw as any,
        organisationId: organisationId ?? null,
      },
    });

    this.logger.log({ subject, eventId: raw.eventId }, 'Stored dead-letter event');
  }

  list(organisationId: string) {
    return this.prisma.deadLetterEvent.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: { select: { retries: true } },
      },
    });
  }

  async retry(id: string) {
    const dlq = await this.prisma.deadLetterEvent.findUnique({
      where: { id },
    });

    if (!dlq) {
      throw new NotFoundException('Dead-letter event not found');
    }

    if (!dlq.originalEvent || typeof dlq.originalEvent !== 'object') {
      throw new BadRequestException('Original event is not available for retry');
    }

    const original = dlq.originalEvent as unknown as EventEnvelope;
    const subject = original.eventType ?? dlq.subject;
    const js = await this.nats.getJetStream();

    try {
      await js.publish(subject, JSON.stringify(original));

      await this.prisma.deadLetterEvent.update({
        where: { id },
        data: {
          retriedAt: new Date(),
          retryCount: { increment: 1 },
        },
      });

      const retry = await this.prisma.deadLetterRetry.create({
        data: {
          deadLetterEventId: id,
          success: true,
          error: null,
        },
      });

      this.logger.log({ deadLetterId: id, subject, eventId: original.eventId }, 'Retried dead-letter event');

      return { retried: true, retry };
    } catch (err) {
      await this.prisma.deadLetterRetry.create({
        data: {
          deadLetterEventId: id,
          success: false,
          error: (err as Error).message,
        },
      });
      throw err;
    }
  }

  private extractOriginalEvent(raw: DeadLetterPayload): unknown {
    if (raw.originalEvent) return raw.originalEvent;
    if (raw.envelope) return raw.envelope;
    return raw;
  }
}
