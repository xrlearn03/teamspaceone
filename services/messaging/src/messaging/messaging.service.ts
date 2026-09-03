import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type CreateChannelDto } from './dto/create-channel.dto.js';
import { type CreateMessageDto } from './dto/create-message.dto.js';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async createChannel(ctx: OrganisationContextValue, dto: CreateChannelDto) {
    const organisationId = ctx.organisationId;
    const createdBy = ctx.actorId;
    if (!createdBy) {
      throw new ForbiddenException('Missing actor');
    }

    const id = randomUUID();
    const payload = {
      id,
      organisationId,
      workspaceId: dto.workspaceId ?? null,
      name: dto.name,
      type: dto.type ?? 'public',
      createdBy,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.CHANNEL_CREATED,
      organisationId,
      actorId: createdBy,
      resourceType: 'channel',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const channel = await tx.channel.create({
        data: {
          id,
          organisationId,
          workspaceId: dto.workspaceId,
          name: dto.name,
          type: dto.type ?? 'public',
          createdBy,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.CHANNEL_CREATED);
      return channel;
    });
  }

  async createMessage(ctx: OrganisationContextValue, dto: CreateMessageDto) {
    const organisationId = ctx.organisationId;
    const senderId = ctx.actorId;
    if (!senderId) {
      throw new ForbiddenException('Missing actor');
    }

    const channel = await this.prisma.channel.findFirst({
      where: { id: dto.channelId, organisationId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const id = randomUUID();
    const payload = {
      id,
      organisationId,
      channelId: dto.channelId,
      senderId,
      content: dto.content,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MESSAGE_CREATED,
      organisationId,
      actorId: senderId,
      resourceType: 'message',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          id,
          organisationId,
          channelId: dto.channelId,
          senderId,
          content: dto.content,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MESSAGE_CREATED);
      return message;
    });
  }

  async listChannels(ctx: OrganisationContextValue) {
    return this.prisma.channel.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listMessages(ctx: OrganisationContextValue, channelId: string) {
    const organisationId = ctx.organisationId;
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organisationId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return this.prisma.message.findMany({
      where: { channelId, organisationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
