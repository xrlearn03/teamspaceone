import { Injectable } from '@nestjs/common';
import { type EventEnvelope, Subjects } from '@reactify/event-contracts';
import { Prisma } from '#prisma';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, any>;
    const eventType = envelope.eventType;
    let resourceType = '';
    let resourceId = '';
    let content = '';

    if (eventType === Subjects.MESSAGE_CREATED) {
      resourceType = 'message';
      resourceId = payload.id as string;
      content = payload.content as string;
    } else if (eventType === Subjects.TASK_CREATED || eventType === Subjects.TASK_UPDATED) {
      resourceType = 'task';
      resourceId = payload.id as string;
      content = `${payload.title as string} ${payload.description as string || ''}`;
    } else if (eventType === Subjects.PROJECT_CREATED) {
      resourceType = 'project';
      resourceId = payload.id as string;
      content = `${payload.name as string} ${payload.description as string || ''}`;
    } else if (eventType === Subjects.FILE_UPLOADED) {
      resourceType = 'file';
      resourceId = payload.id as string;
      content = payload.originalName as string;
    } else if (eventType === Subjects.MEETING_STARTED) {
      resourceType = 'meeting';
      resourceId = payload.id as string;
      content = payload.title as string || '';
    } else {
      return;
    }

    await tx.searchIndex.upsert({
      where: { resourceType_resourceId: { resourceType, resourceId } },
      create: {
        organisationId: envelope.organisationId,
        resourceType,
        resourceId,
        content,
      },
      update: {
        content,
      },
    });
  }

  async search(ctx: OrganisationContextValue, query: string) {
    const q = query.replace(/[%_]/g, '\\$&');
    return this.prisma.$queryRaw`
      SELECT "id", "resourceType", "resourceId", "content", "createdAt"
      FROM "search_index"
      WHERE "organisationId" = ${ctx.organisationId}
        AND to_tsvector('english', "content") @@ plainto_tsquery('english', ${q})
      ORDER BY "createdAt" DESC
      LIMIT 50
    `;
  }
}
