import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '#prisma';
import { createEventEnvelope, type EventEnvelope } from '@teamspace-one/event-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';

export interface CreateEntityInput {
  organisationId: string;
  actorId?: string;
  correlationId?: string;
  name: string;
}

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async createEntity(input: CreateEntityInput) {
    const id = randomUUID();

    const envelope = createEventEnvelope({
      eventType: 'teamspace-one.template.created',
      organisationId: input.organisationId,
      actorId: input.actorId,
      resourceType: 'template-entity',
      resourceId: id,
      correlationId: input.correlationId,
      payload: { name: input.name },
    });

    const entity = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.templateEntity.create({
        data: {
          id,
          organisationId: input.organisationId,
          name: input.name,
        },
      });

      await this.outbox.createEvent(tx, envelope, envelope.eventType);

      return created;
    });

    return { entity, event: envelope };
  }

  listByOrganisation(organisationId: string) {
    return this.prisma.templateEntity.findMany({
      where: { organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
