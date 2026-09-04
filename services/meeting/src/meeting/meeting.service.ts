import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { LiveKitService, type MeetingTokenOptions } from '../livekit/livekit.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';
import { type JoinMeetingDto } from './dto/join-meeting.dto.js';
import { type CreateVoiceRoomDto } from './dto/create-voice-room.dto.js';

function generateRoomName(organisationId: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `org-${organisationId.slice(0, 8)}-${slug}-${randomUUID().slice(0, 8)}`;
}

@Injectable()
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly livekit: LiveKitService,
  ) {}

  async resolveAccess(meetingId: string, actorId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return null;
    const participant = await this.prisma.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId, userId: actorId } } });
    if (meeting.status === 'ended' && !participant && meeting.createdBy !== actorId) return null;
    return { organisationId: meeting.organisationId, workspaceId: meeting.workspaceId };
  }

  async create(ctx: OrganisationContextValue, dto: CreateMeetingDto) {
    const organisationId = ctx.organisationId;
    const createdBy = ctx.actorId;
    if (!createdBy) throw new ForbiddenException('Missing actor');

    const id = randomUUID();
    const roomName = generateRoomName(organisationId, dto.title);
    const payload = {
      id,
      organisationId,
      workspaceId: dto.workspaceId ?? null,
      roomName,
      title: dto.title,
      description: dto.description ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt).toISOString() : null,
      type: 'meeting',
      createdBy,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_CREATED,
      organisationId,
      workspaceId: dto.workspaceId,
      actorId: createdBy,
      resourceType: 'meeting',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const meeting = await tx.meeting.create({
        data: {
          id,
          organisationId,
          workspaceId: dto.workspaceId,
          roomName,
          title: dto.title,
          description: dto.description,
          type: 'meeting',
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          createdBy,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_CREATED);
      return meeting;
    });
  }

  async createVoiceRoom(ctx: OrganisationContextValue, dto: CreateVoiceRoomDto) {
    const organisationId = ctx.organisationId;
    const createdBy = ctx.actorId;
    if (!createdBy) throw new ForbiddenException('Missing actor');

    const id = randomUUID();
    const roomName = generateRoomName(organisationId, dto.title);
    const payload = {
      id,
      organisationId,
      workspaceId: dto.workspaceId ?? null,
      roomName,
      title: dto.title,
      type: 'voice_room',
      createdBy,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.VOICE_ROOM_CREATED,
      organisationId,
      workspaceId: dto.workspaceId,
      actorId: createdBy,
      resourceType: 'voice_room',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const meeting = await tx.meeting.create({
        data: {
          id,
          organisationId,
          workspaceId: dto.workspaceId,
          roomName,
          title: dto.title,
          type: 'voice_room',
          status: 'started',
          startedAt: new Date(),
          createdBy,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.VOICE_ROOM_CREATED);
      return meeting;
    });
  }

  async list(ctx: OrganisationContextValue) {
    return this.prisma.meeting.findMany({
      where: { organisationId: ctx.organisationId },
      include: { participants: { where: { leftAt: null } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: { participants: { where: { leftAt: null } } },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async start(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.getById(ctx, id);
    if (meeting.status === 'started') throw new ConflictException('Meeting already started');

    const payload = {
      id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      startedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_STARTED,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      resourceType: 'meeting',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meeting.update({
        where: { id },
        data: { status: 'started', startedAt: new Date() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_STARTED);
      return updated;
    });

    try {
      await this.livekit.createRoom({
        name: meeting.roomName,
        maxParticipants: 100,
        metadata: { meetingId: id, organisationId: ctx.organisationId },
      });
    } catch (err) {
      // Room auto-creates on first join, so this is not fatal.
    }

    return updated;
  }

  async end(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.getById(ctx, id);
    if (meeting.status === 'ended') throw new ConflictException('Meeting already ended');

    const payload = {
      id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      endedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_ENDED,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      resourceType: 'meeting',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meeting.update({
        where: { id },
        data: { status: 'ended', endedAt: new Date() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_ENDED);
      return updated;
    });

    try {
      await this.livekit.deleteRoom(meeting.roomName);
    } catch (err) {
      // Best-effort cleanup.
    }

    return updated;
  }

  async join(ctx: OrganisationContextValue, id: string, dto: JoinMeetingDto) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, id);
    if (meeting.status === 'ended') throw new ConflictException('Meeting has ended');

    const identity = dto.identity ?? `user-${userId}`;
    const tokenOptions: MeetingTokenOptions = {
      roomName: meeting.roomName,
      identity,
      userId,
      name: dto.name || identity,
      canPublish: true,
      canSubscribe: true,
      canScreenShare: true,
      isAdmin: userId === meeting.createdBy,
    };

    const participantId = randomUUID();
    const payload = {
      participantId,
      meetingId: id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      userId,
      identity,
      joinedAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_PARTICIPANT_JOINED,
      organisationId: ctx.organisationId,
      actorId: userId,
      resourceType: 'meeting_participant',
      resourceId: participantId,
      correlationId: ctx.correlationId,
      payload,
    });

    const token = await this.livekit.generateToken(tokenOptions);

    const [participant] = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId: id, userId } },
      });
      if (existing) {
        const updated = await tx.meetingParticipant.update({
          where: { id: existing.id },
          data: { leftAt: null, updatedAt: new Date() },
        });
        return [updated];
      }
      const created = await tx.meetingParticipant.create({
        data: {
          id: participantId,
          meetingId: id,
          organisationId: ctx.organisationId,
          userId,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_PARTICIPANT_JOINED);
      return [created];
    });

    return { participant, token };
  }

  async leave(ctx: OrganisationContextValue, id: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, id);
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId } },
    });
    if (!participant || participant.leftAt) throw new NotFoundException('Participant not found');

    const payload = {
      participantId: participant.id,
      meetingId: id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      userId,
      leftAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_PARTICIPANT_LEFT,
      organisationId: ctx.organisationId,
      actorId: userId,
      resourceType: 'meeting_participant',
      resourceId: participant.id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meetingParticipant.update({
        where: { id: participant.id },
        data: { leftAt: new Date(), updatedAt: new Date() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_PARTICIPANT_LEFT);
      return updated;
    });
  }

  async setScreenShare(ctx: OrganisationContextValue, id: string, isScreenSharing: boolean) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, id);
    const participant = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId: id, userId } },
    });
    if (!participant || participant.leftAt) throw new NotFoundException('Participant not found');

    const payload = {
      participantId: participant.id,
      meetingId: id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      userId,
      isScreenSharing,
      occurredAt: new Date().toISOString(),
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_SCREEN_SHARED,
      organisationId: ctx.organisationId,
      actorId: userId,
      resourceType: 'meeting_participant',
      resourceId: participant.id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meetingParticipant.update({
        where: { id: participant.id },
        data: { isScreenSharing, updatedAt: new Date() },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_SCREEN_SHARED);
      return updated;
    });
  }

  async getToken(ctx: OrganisationContextValue, id: string, name?: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, id);
    const participant = await this.prisma.meetingParticipant.findFirst({
      where: { meetingId: id, userId, leftAt: null },
    });
    if (!participant) throw new ForbiddenException('Join the meeting first');

    const token = await this.livekit.generateToken({
      roomName: meeting.roomName,
      identity: `user-${userId}`,
      userId,
      name: name || `user-${userId}`,
      isAdmin: userId === meeting.createdBy,
      canPublish: true,
      canSubscribe: true,
      canScreenShare: true,
    });

    return { token, roomName: meeting.roomName };
  }

  async createMeetingMessage(ctx: OrganisationContextValue, meetingId: string, content: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    const text = content.trim();
    if (!text) throw new BadRequestException('Message content is required');
    if (text.length > 10000) throw new BadRequestException('Message content is too long');

    const meeting = await this.getById(ctx, meetingId);
    const participant = await this.prisma.meetingParticipant.findFirst({
      where: { meetingId, userId, leftAt: null },
    });
    if (!participant) throw new ForbiddenException('Join the meeting to chat');

    const id = randomUUID();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const message = await tx.meetingMessage.create({
        data: {
          id,
          meetingId,
          organisationId: ctx.organisationId,
          userId,
          content: text,
        },
      });
      const payload = { ...message, meetingId, roomName: meeting.roomName };
      const envelope = createEventEnvelope({
        eventType: Subjects.MEETING_CHAT_CREATED,
        organisationId: ctx.organisationId,
        actorId: userId,
        resourceType: 'meeting_message',
        resourceId: id,
        correlationId: ctx.correlationId,
        payload,
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_CHAT_CREATED);
      return message;
    });
  }

  async listMeetingMessages(ctx: OrganisationContextValue, meetingId: string, cursor?: string, limit = 50) {
    await this.getById(ctx, meetingId);
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 100);
    const rows = await this.prisma.meetingMessage.findMany({
      where: { meetingId, organisationId: ctx.organisationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: take + 1,
    });
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows).reverse();
    return { items, nextCursor: hasMore ? rows[take - 1]?.id ?? null : null };
  }

  async createMeetingReaction(ctx: OrganisationContextValue, meetingId: string, emoji: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    if (!emoji) throw new BadRequestException('Emoji is required');

    const meeting = await this.getById(ctx, meetingId);
    const participant = await this.prisma.meetingParticipant.findFirst({
      where: { meetingId, userId, leftAt: null },
    });
    if (!participant) throw new ForbiddenException('Join the meeting to react');

    const id = randomUUID();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const reaction = await tx.meetingReaction.create({
        data: { id, meetingId, organisationId: ctx.organisationId, userId, emoji },
      });
      const payload = { ...reaction, meetingId, roomName: meeting.roomName };
      const envelope = createEventEnvelope({
        eventType: Subjects.MEETING_REACTION_CREATED,
        organisationId: ctx.organisationId,
        actorId: userId,
        resourceType: 'meeting_reaction',
        resourceId: id,
        correlationId: ctx.correlationId,
        payload,
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_REACTION_CREATED);
      return reaction;
    });
  }

  async listMeetingReactions(ctx: OrganisationContextValue, meetingId: string) {
    await this.getById(ctx, meetingId);
    return this.prisma.meetingReaction.findMany({
      where: { meetingId, organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateRaiseHand(ctx: OrganisationContextValue, meetingId: string, raised: boolean) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, meetingId);
    const participant = await this.prisma.meetingParticipant.findFirst({
      where: { meetingId, userId, leftAt: null },
    });
    if (!participant) throw new ForbiddenException('Join the meeting to raise hand');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.meetingRaiseHand.upsert({
        where: { meetingId_userId: { meetingId, userId } },
        create: { id: randomUUID(), meetingId, organisationId: ctx.organisationId, userId, raised },
        update: { raised, updatedAt: new Date() },
      });
      const payload = { ...record, meetingId, roomName: meeting.roomName };
      const envelope = createEventEnvelope({
        eventType: Subjects.MEETING_RAISE_HAND_CHANGED,
        organisationId: ctx.organisationId,
        actorId: userId,
        resourceType: 'meeting_raise_hand',
        resourceId: record.id,
        correlationId: ctx.correlationId,
        payload,
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_RAISE_HAND_CHANGED);
      return record;
    });
  }

  async listRaiseHands(ctx: OrganisationContextValue, meetingId: string) {
    await this.getById(ctx, meetingId);
    return this.prisma.meetingRaiseHand.findMany({
      where: { meetingId, organisationId: ctx.organisationId, raised: true },
    });
  }

  async setRecording(ctx: OrganisationContextValue, meetingId: string, recording: boolean) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, meetingId);
    if (userId !== meeting.createdBy) throw new ForbiddenException('Only the meeting creator can control recording');

    const eventType = recording ? Subjects.MEETING_RECORDING_STARTED : Subjects.MEETING_RECORDING_STOPPED;

    let egressId: string | undefined | null = meeting.recordingEgressId;
    if (recording && !egressId) {
      egressId = await this.livekit.startRecording(meeting.roomName);
    } else if (!recording && egressId) {
      await this.livekit.stopRecording(egressId);
      egressId = null;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meeting.update({
        where: { id: meetingId },
        data: { isRecording: recording, recordingEgressId: egressId, updatedAt: new Date() },
      });
      const payload = { meetingId, roomName: meeting.roomName, isRecording: recording, recordedBy: userId, egressId };
      const envelope = createEventEnvelope({
        eventType,
        organisationId: ctx.organisationId,
        actorId: userId,
        resourceType: 'meeting',
        resourceId: meetingId,
        correlationId: ctx.correlationId,
        payload,
      });
      await this.outbox.createEvent(tx, envelope, eventType);
      return updated;
    });
  }
}
