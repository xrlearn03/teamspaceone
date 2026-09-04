import { Injectable } from '@nestjs/common';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';

@Injectable()
export class AuditService {
  async store(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    await tx.auditEvent.create({
      data: {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        subject: envelope.eventType,
        payload: envelope as any,
        organisationId: envelope.organisationId,
        actorId: envelope.actorId,
        resourceType: envelope.resourceType,
        resourceId: envelope.resourceId,
        correlationId: envelope.correlationId,
        timestamp: envelope.occurredAt,
      },
    });
  }
}
