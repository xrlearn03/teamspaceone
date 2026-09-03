import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(ctx: OrganisationContextValue, dto: CreateMeetingDto) {
    const organisationId = ctx.organisationId;
    const createdBy = ctx.actorId;
    if (!createdBy) throw new ForbiddenException('Missing actor');

    return this.prisma.meeting.create({
      data: {
        id: randomUUID(),
        organisationId,
        workspaceId: dto.workspaceId,
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy,
      },
    });
  }

  async list(ctx: OrganisationContextValue) {
    return this.prisma.meeting.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async start(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const payload = { id, organisationId: ctx.organisationId, startedAt: new Date().toISOString() };
    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_STARTED,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      resourceType: 'meeting',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meeting.update({
        where: { id },
        data: { status: 'started', startedAt: new Date() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_STARTED);
      return updated;
    });
  }

  async end(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const payload = { id, organisationId: ctx.organisationId, endedAt: new Date().toISOString() };
    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_ENDED,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      resourceType: 'meeting',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meeting.update({
        where: { id },
        data: { status: 'ended', endedAt: new Date() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_ENDED);
      return updated;
    });
  }
}
