import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '#prisma';
import { type EventEnvelope } from '@teamspace-one/event-contracts';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async canAccess(userId: string, type: string, id: string): Promise<boolean> {
    const access = await this.prisma.resourceAccess.findUnique({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType: type,
          resourceId: id,
        },
      },
    });
    return Boolean(access);
  }

  async applyEvent(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const userIds = this.extractMemberIds(payload);
    const resourceType = this.inferResourceType(envelope.eventType);
    const resourceId = this.extractResourceId(payload, envelope.resourceId);
    const organisationId = envelope.organisationId;

    if (resourceType === 'unknown' || !resourceId || !userIds.length) {
      this.logger.debug({ eventType: envelope.eventType }, 'No resource access update for event');
      return;
    }

    if (envelope.eventType === 'teamspace-one.meeting.participant.left') {
      await tx.resourceAccess.deleteMany({
        where: { userId: { in: userIds }, resourceType, resourceId },
      });
      return;
    }

    if (envelope.eventType.includes('.members_updated')) {
      // Full replacement: remove existing and insert the new list
      await tx.resourceAccess.deleteMany({
        where: { resourceType, resourceId },
      });
      await tx.resourceAccess.createMany({
        data: userIds.map((userId) => ({
          userId,
          resourceType,
          resourceId,
          organisationId,
        })),
        skipDuplicates: true,
      });
      return;
    }

    for (const userId of userIds) {
      await tx.resourceAccess.upsert({
        where: {
          userId_resourceType_resourceId: {
            userId,
            resourceType,
            resourceId,
          },
        },
        update: { organisationId },
        create: { userId, resourceType, resourceId, organisationId },
      });
    }
  }

  private extractMemberIds(payload: Record<string, unknown>): string[] {
    const ids: string[] = [];

    if (typeof payload.userId === 'string') {
      ids.push(payload.userId);
    }

    if (Array.isArray(payload.memberIds)) {
      ids.push(...(payload.memberIds as string[]));
    }

    if (Array.isArray(payload.userIds)) {
      ids.push(...(payload.userIds as string[]));
    }

    if (Array.isArray(payload.members)) {
      for (const m of payload.members as Array<string | { userId?: string }>) {
        const id = typeof m === 'string' ? m : m?.userId;
        if (typeof id === 'string') ids.push(id);
      }
    }

    return [...new Set(ids)];
  }

  private extractResourceId(payload: Record<string, unknown>, fallback: string): string {
    if (typeof payload.id === 'string') return payload.id;
    if (typeof payload.channelId === 'string') return payload.channelId;
    if (typeof payload.projectId === 'string') return payload.projectId;
    if (typeof payload.meetingId === 'string') return payload.meetingId;
    if (typeof payload.workspaceId === 'string') return payload.workspaceId;
    if (typeof payload.organisationId === 'string') return payload.organisationId;
    return fallback;
  }

  private inferResourceType(eventType: string): string {
    if (eventType.includes('channel')) return 'channel';
    if (eventType.includes('project')) return 'project';
    if (eventType.includes('meeting')) return 'meeting';
    if (eventType.includes('workspace')) return 'workspace';
    if (eventType.includes('organisation')) return 'organisation';
    return 'unknown';
  }
}
