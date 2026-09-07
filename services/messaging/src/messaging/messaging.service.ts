import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects, type Subject } from '@teamspace-one/event-contracts';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type CreateChannelDto } from './dto/create-channel.dto.js';
import { type CreateDirectChannelDto } from './dto/create-direct-channel.dto.js';
import { type CreateMessageDto } from './dto/create-message.dto.js';
import { type UpdateChannelDto } from './dto/update-channel.dto.js';
import { type UpdateMessageDto } from './dto/update-message.dto.js';

const channelInclude = { members: { orderBy: { joinedAt: 'asc' as const } } };
const messageInclude = {
  attachments: true,
  reactions: { orderBy: { createdAt: 'asc' as const } },
  mentions: { orderBy: { createdAt: 'asc' as const }, select: { userId: true } },
  _count: { select: { replies: { where: { deletedAt: null } } } },
};

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async createChannel(ctx: OrganisationContextValue, dto: CreateChannelDto) {
    const actorId = this.actor(ctx);
    const name = this.name(dto.name);
    const type = dto.type ?? 'public';
    if (type !== 'public' && type !== 'private') {
      throw new BadRequestException('Channel type must be public or private');
    }

    const memberIds = this.uniqueIds([actorId, ...(dto.memberIds ?? [])]);
    const id = randomUUID();
    const payload = { id, organisationId: ctx.organisationId, workspaceId: dto.workspaceId ?? null, name, type, createdBy: actorId, memberIds };

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const channel = await tx.channel.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          workspaceId: dto.workspaceId,
          name,
          type,
          createdBy: actorId,
          members: {
            create: memberIds.map((userId) => ({ id: randomUUID(), userId, role: userId === actorId ? 'owner' : 'member' })),
          },
        },
        include: channelInclude,
      });
      await this.event(tx, ctx, Subjects.CHANNEL_CREATED, 'channel', id, payload);
      return channel;
    });
  }

  async createDirectChannel(ctx: OrganisationContextValue, dto: CreateDirectChannelDto) {
    const actorId = this.actor(ctx);
    const memberIds = this.uniqueIds([actorId, ...(dto.memberIds ?? [])]).sort();
    if (memberIds.length < 2 || memberIds.length > 20) {
      throw new BadRequestException('Direct conversations require 2 to 20 unique members');
    }
    const directKey = memberIds.join(':');
    const existing = await this.prisma.channel.findUnique({
      where: { organisationId_directKey: { organisationId: ctx.organisationId, directKey } },
      include: channelInclude,
    });
    if (existing) return existing;

    const id = randomUUID();
    const name = memberIds.length === 2 ? 'Direct message' : 'Group conversation';
    const payload = { id, organisationId: ctx.organisationId, name, type: 'direct', directKey, createdBy: actorId, memberIds };

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const channel = await tx.channel.create({
          data: {
            id,
            organisationId: ctx.organisationId,
            name,
            type: 'direct',
            directKey,
            createdBy: actorId,
            members: { create: memberIds.map((userId) => ({ id: randomUUID(), userId, role: userId === actorId ? 'owner' : 'member' })) },
          },
          include: channelInclude,
        });
        await this.event(tx, ctx, Subjects.CHANNEL_CREATED, 'channel', id, payload);
        return channel;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.channel.findUniqueOrThrow({
          where: { organisationId_directKey: { organisationId: ctx.organisationId, directKey } },
          include: channelInclude,
        });
      }
      throw error;
    }
  }

  async listChannels(ctx: OrganisationContextValue) {
    const actorId = this.actor(ctx);
    return this.prisma.channel.findMany({
      where: {
        organisationId: ctx.organisationId,
        OR: [{ type: 'public' }, { members: { some: { userId: actorId } } }],
      },
      include: channelInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async updateChannel(ctx: OrganisationContextValue, channelId: string, dto: UpdateChannelDto) {
    const channel = await this.ownedChannel(ctx, channelId);
    if (channel.type === 'direct') throw new BadRequestException('Direct conversations cannot be renamed');
    const data: { name?: string; type?: string } = {};
    if (dto.name !== undefined) data.name = this.name(dto.name);
    if (dto.type !== undefined) {
      if (dto.type !== 'public' && dto.type !== 'private') throw new BadRequestException('Invalid channel type');
      data.type = dto.type;
    }
    if (!Object.keys(data).length) throw new BadRequestException('No channel changes supplied');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.channel.update({ where: { id: channelId }, data, include: channelInclude });
      await this.event(tx, ctx, Subjects.CHANNEL_UPDATED, 'channel', channelId, updated);
      return updated;
    });
  }

  async replaceMembers(ctx: OrganisationContextValue, channelId: string, requestedIds: string[]) {
    const channel = await this.ownedChannel(ctx, channelId);
    if (channel.type === 'direct') throw new BadRequestException('Direct conversation membership is immutable');
    const actorId = this.actor(ctx);
    const memberIds = this.uniqueIds([actorId, ...(requestedIds ?? [])]);
    const previousMemberIds = channel.members.map((m) => m.userId);
    const addedMemberIds = memberIds.filter((id) => !previousMemberIds.includes(id));
    const removedMemberIds = previousMemberIds.filter((id) => !memberIds.includes(id));

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.channelMember.deleteMany({ where: { channelId, userId: { notIn: memberIds } } });
      for (const userId of memberIds) {
        await tx.channelMember.upsert({
          where: { channelId_userId: { channelId, userId } },
          create: { id: randomUUID(), channelId, userId, role: userId === actorId ? 'owner' : 'member' },
          update: userId === actorId ? { role: 'owner' } : {},
        });
      }
      const updated = await tx.channel.findUniqueOrThrow({ where: { id: channelId }, include: channelInclude });
      await this.event(tx, ctx, Subjects.CHANNEL_MEMBERS_UPDATED, 'channel', channelId, {
        id: channelId,
        name: channel.name,
        memberIds,
        addedMemberIds,
        removedMemberIds,
      });
      return updated;
    });
  }

  async deleteChannel(ctx: OrganisationContextValue, channelId: string) {
    await this.ownedChannel(ctx, channelId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.channel.delete({ where: { id: channelId } });
      await this.event(tx, ctx, Subjects.CHANNEL_DELETED, 'channel', channelId, { id: channelId });
    });
  }

  async createMessage(ctx: OrganisationContextValue, dto: CreateMessageDto) {
    const senderId = this.actor(ctx);
    const channel = await this.accessibleChannel(ctx, dto.channelId);
    const content = dto.content?.trim() ?? '';
    const attachmentIds = this.uniqueIds(dto.attachmentIds ?? []);
    if (!content && !attachmentIds.length) throw new BadRequestException('Message content or an attachment is required');
    if (content.length > 10000) throw new BadRequestException('Message content is too long');
    if (attachmentIds.length > 10) throw new BadRequestException('A message can contain at most 10 attachments');

    let parentMessageId: string | undefined;
    if (dto.parentMessageId) {
      const parent = await this.accessibleMessage(ctx, dto.parentMessageId);
      if (parent.channelId !== dto.channelId) throw new BadRequestException('Thread reply must be in the same channel');
      if (parent.parentMessageId) throw new BadRequestException('Cannot reply to a thread reply');
      if (parent.deletedAt) throw new BadRequestException('Cannot reply to a deleted message');
      parentMessageId = parent.id;
    }

    const id = randomUUID();
    const memberIds = channel.members.map((m) => m.userId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.message.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          channelId: dto.channelId,
          senderId,
          parentMessageId,
          content,
          attachments: { create: attachmentIds.map((fileId) => ({ id: randomUUID(), fileId })) },
        },
        include: messageInclude,
      });
      await this.syncMentions(tx, id, content, memberIds);
      await tx.channel.update({ where: { id: dto.channelId }, data: { updatedAt: new Date() } });
      const messageWithMentions = await tx.message.findUniqueOrThrow({
        where: { id },
        include: messageInclude,
      });
      const recipientIds = [...new Set([...memberIds, ...this.extractMentions(content)])];
      await this.event(tx, ctx, Subjects.MESSAGE_CREATED, 'message', id, { ...messageWithMentions, recipientIds });
      return messageWithMentions;
    });
  }

  async listMessages(ctx: OrganisationContextValue, channelId: string, cursor?: string, limit = 50) {
    await this.accessibleChannel(ctx, channelId);
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 100);
    const rows = await this.prisma.message.findMany({
      where: { channelId, organisationId: ctx.organisationId, parentMessageId: null },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows).reverse();
    return { items, nextCursor: hasMore ? rows[take - 1]?.id ?? null : null };
  }

  async listThreadMessages(ctx: OrganisationContextValue, parentMessageId: string, cursor?: string, limit = 50) {
    const parent = await this.accessibleMessage(ctx, parentMessageId);
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 100);
    const rows = await this.prisma.message.findMany({
      where: { parentMessageId: parent.id, organisationId: ctx.organisationId, deletedAt: null },
      include: messageInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows).reverse();
    return { items, nextCursor: hasMore ? rows[take - 1]?.id ?? null : null };
  }

  async updateMessage(ctx: OrganisationContextValue, messageId: string, dto: UpdateMessageDto) {
    const message = await this.ownedMessage(ctx, messageId);
    const content = dto.content?.trim();
    if (!content) throw new BadRequestException('Message content is required');
    if (content.length > 10000) throw new BadRequestException('Message content is too long');
    const editedAt = new Date();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.message.update({ where: { id: messageId }, data: { content, editedAt }, include: messageInclude });
      const channel = await tx.channel.findUnique({
        where: { id: updated.channelId },
        include: { members: { select: { userId: true } } },
      });
      const memberIds = channel?.members.map((m) => m.userId) ?? [];
      await this.syncMentions(tx, messageId, content, memberIds);
      const updatedWithMentions = await tx.message.findUniqueOrThrow({
        where: { id: messageId },
        include: messageInclude,
      });
      const recipientIds = [...new Set([...memberIds, ...this.extractMentions(content)])];
      await this.event(tx, ctx, Subjects.MESSAGE_UPDATED, 'message', messageId, { ...updatedWithMentions, recipientIds });
      return updatedWithMentions;
    });
  }

  async deleteMessage(ctx: OrganisationContextValue, messageId: string) {
    const message = await this.ownedMessage(ctx, messageId);
    const deletedAt = new Date();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deleted = await tx.message.update({
        where: { id: messageId },
        data: { content: '', deletedAt, attachments: { deleteMany: {} } },
        include: messageInclude,
      });
      await this.event(tx, ctx, Subjects.MESSAGE_DELETED, 'message', messageId, { id: messageId, channelId: message.channelId, deletedAt });
      return deleted;
    });
  }

  async toggleReaction(ctx: OrganisationContextValue, messageId: string, emoji: string) {
    const actorId = this.actor(ctx);
    const message = await this.accessibleMessage(ctx, messageId);
    const cleanEmoji = emoji?.trim();
    if (!cleanEmoji || cleanEmoji.length > 32) {
      throw new BadRequestException('A valid emoji is required');
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.messageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId: message.id, userId: actorId, emoji: cleanEmoji } },
      });
      if (existing) {
        await tx.messageReaction.delete({ where: { id: existing.id } });
      } else {
        await tx.messageReaction.create({
          data: { id: randomUUID(), messageId: message.id, userId: actorId, emoji: cleanEmoji },
        });
      }
      const reactions = await tx.messageReaction.findMany({
        where: { messageId: message.id },
        orderBy: { createdAt: 'asc' },
      });
      await this.event(tx, ctx, Subjects.MESSAGE_REACTION_UPDATED, 'message', message.id, {
        id: message.id,
        channelId: message.channelId,
        reactions,
      });
      return { id: message.id, channelId: message.channelId, reactions };
    });
  }

  async resolveAccess(channelId: string, actorId: string, organisationId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organisationId },
      include: { members: { where: { userId: actorId } } },
    });
    if (!channel) return null;
    if (channel.type !== 'public' && channel.members.length === 0) return null;
    return { organisationId: channel.organisationId, workspaceId: channel.workspaceId };
  }

  private actor(ctx: OrganisationContextValue): string {
    if (!ctx.actorId) throw new ForbiddenException('Missing actor');
    return ctx.actorId;
  }

  private name(value: string): string {
    const name = value?.trim();
    if (!name || name.length > 80) throw new BadRequestException('Channel name must be between 1 and 80 characters');
    return name;
  }

  private uniqueIds(ids: string[]): string[] {
    return [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
  }

  private async accessibleChannel(ctx: OrganisationContextValue, channelId: string) {
    const actorId = this.actor(ctx);
    const channel = await this.prisma.channel.findFirst({
      where: {
        id: channelId,
        organisationId: ctx.organisationId,
        OR: [{ type: 'public' }, { members: { some: { userId: actorId } } }],
      },
      include: channelInclude,
    });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  private async ownedChannel(ctx: OrganisationContextValue, channelId: string) {
    const actorId = this.actor(ctx);
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organisationId: ctx.organisationId, members: { some: { userId: actorId, role: 'owner' } } },
      include: channelInclude,
    });
    if (!channel) throw new NotFoundException('Channel not found or not owned by actor');
    return channel;
  }

  private async accessibleMessage(ctx: OrganisationContextValue, messageId: string) {
    const actorId = this.actor(ctx);
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        organisationId: ctx.organisationId,
        deletedAt: null,
        channel: { OR: [{ type: 'public' }, { members: { some: { userId: actorId } } }] },
      },
    });
    if (!message) throw new NotFoundException('Message not found or not accessible');
    return message;
  }

  private async ownedMessage(ctx: OrganisationContextValue, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, organisationId: ctx.organisationId, senderId: this.actor(ctx), deletedAt: null },
    });
    if (!message) throw new NotFoundException('Message not found or not owned by actor');
    return message;
  }

  private extractMentions(content: string): string[] {
    if (!content) return [];
    const matches = content.match(/<@([a-zA-Z0-9_-]+)>/g) || [];
    return [...new Set(matches.map((m) => m.slice(2, -1)))].filter(Boolean);
  }

  private async syncMentions(
    tx: Prisma.TransactionClient,
    messageId: string,
    content: string,
    memberIds: string[],
  ): Promise<void> {
    const mentionIds = this.extractMentions(content).filter((userId) => memberIds.includes(userId));

    await tx.messageMention.deleteMany({
      where: { messageId, userId: { notIn: mentionIds } },
    });

    if (mentionIds.length === 0) return;

    await tx.messageMention.createMany({
      data: mentionIds.map((userId) => ({
        id: randomUUID(),
        messageId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  private async event(
    tx: Prisma.TransactionClient,
    ctx: OrganisationContextValue,
    eventType: Subject,
    resourceType: string,
    resourceId: string,
    payload: unknown,
  ) {
    const envelope = createEventEnvelope({
      eventType,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      resourceType,
      resourceId,
      correlationId: ctx.correlationId,
      payload,
    });
    await this.outbox.createEvent(tx, envelope, eventType);
  }
}
