import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID, createHmac } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { type CreateMeetingDto } from './dto/create-meeting.dto.js';
import { type JoinMeetingDto } from './dto/join-meeting.dto.js';
import { type CreateVoiceRoomDto } from './dto/create-voice-room.dto.js';

function generateRoomName(organisationId: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `org-${organisationId.slice(0, 8)}-${slug}-${randomUUID().slice(0, 8)}`;
}

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async resolveAccess(meetingId: string, actorId: string, organisationId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, organisationId },
    });
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
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    return this.prisma.meeting.findMany({
      where: {
        organisationId: ctx.organisationId,
        OR: [
          { createdBy: userId },
          { participants: { some: { userId, leftAt: null } } },
        ],
      },
      include: { participants: { where: { leftAt: null } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Calendar foundation: exposes scheduled meetings the actor can see as
   * generic calendar events. Other modules (e.g. HRMS leave) can be merged
   * into this shape later without changing the API.
   */
  async listCalendarEvents(ctx: OrganisationContextValue, from?: string, to?: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
      throw new BadRequestException('Invalid calendar range');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('Calendar range start must be before end');
    }

    const meetings = await this.prisma.meeting.findMany({
      where: {
        organisationId: ctx.organisationId,
        scheduledAt: {
          not: null,
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        },
        OR: [
          { createdBy: userId },
          { participants: { some: { userId, leftAt: null } } },
        ],
      },
      include: { participants: { where: { leftAt: null } } },
      orderBy: { scheduledAt: 'asc' },
    });

    return meetings.map((meeting) => ({
      id: `meeting:${meeting.id}`,
      type: 'meeting' as const,
      sourceId: meeting.id,
      title: meeting.title,
      description: meeting.description,
      startsAt: meeting.scheduledAt,
      endsAt: meeting.endedAt ?? meeting.scheduledAt,
      status: meeting.status,
      meetingType: meeting.type,
      workspaceId: meeting.workspaceId,
      participantCount: meeting.participants.length,
    }));
  }

  async getById(ctx: OrganisationContextValue, id: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: { participants: { where: { leftAt: null } } },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const isParticipant = meeting.participants.some((p) => p.userId === userId);
    const isCreator = meeting.createdBy === userId;
    if (!isParticipant && !isCreator) throw new NotFoundException('Meeting not found');
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

    return updated;
  }

  async end(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.getById(ctx, id);
    if (meeting.status === 'ended') throw new ConflictException('Meeting already ended');

    const messages = await this.prisma.meetingMessage.findMany({
      where: { meetingId: id, organisationId: ctx.organisationId },
      orderBy: { createdAt: 'asc' },
    });
    const transcript = messages.map((m) => `[${m.userId}] ${m.content}`).join('\n');
    const participantIds = meeting.participants.map((p) => p.userId);

    const payload = {
      id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      title: meeting.title,
      transcript,
      participantIds,
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

    return updated;
  }

  async join(ctx: OrganisationContextValue, id: string, dto: JoinMeetingDto) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, id);
    if (meeting.status === 'ended') throw new ConflictException('Meeting has ended');

    const identity = dto.identity ?? `user-${userId}`;

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

    return { participant };
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

  async getSfuToken(ctx: OrganisationContextValue, id: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, id);
    const secret = process.env.SFU_TOKEN_SECRET;
    if (!secret) throw new Error('SFU_TOKEN_SECRET environment variable is required');

    const ttlSeconds = Number(process.env.SFU_TOKEN_TTL_SECONDS ?? 4 * 60 * 60);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const roomB64 = Buffer.from(meeting.id).toString('base64url');
    const userB64 = Buffer.from(userId).toString('base64url');
    const base = `${roomB64}.${userB64}.${exp}`;
    const signature = createHmac('sha256', secret).update(base).digest('hex');

    return { token: `${base}.${signature}`, roomId: meeting.id, userId };
  }

  async createInterviewRoom(organisationId: string, id: string, title: string) {
    const existing = await this.prisma.meeting.findFirst({
      where: { id, organisationId },
    });
    if (existing) return existing;

    const roomName = `interview-${id}`;
    return this.prisma.meeting.create({
      data: {
        id,
        organisationId,
        roomName,
        title,
        type: 'interview',
        status: 'scheduled',
        createdBy: 'interview-service',
      },
    });
  }

  async getSfuTokenForInterview(organisationId: string, id: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, organisationId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const secret = process.env.SFU_TOKEN_SECRET;
    if (!secret) throw new Error('SFU_TOKEN_SECRET environment variable is required');

    const ttlSeconds = Number(process.env.SFU_TOKEN_TTL_SECONDS ?? 4 * 60 * 60);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const roomB64 = Buffer.from(meeting.id).toString('base64url');
    const userB64 = Buffer.from(userId).toString('base64url');
    const base = `${roomB64}.${userB64}.${exp}`;
    const signature = createHmac('sha256', secret).update(base).digest('hex');

    return { token: `${base}.${signature}`, roomId: meeting.id, userId, roomName: meeting.roomName };
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

  private sfuControlToken(roomId: string): string {
    const secret = process.env.SFU_TOKEN_SECRET;
    if (!secret) throw new Error('SFU_TOKEN_SECRET environment variable is required');
    const exp = Math.floor(Date.now() / 1000) + 300;
    const roomB64 = Buffer.from(roomId).toString('base64url');
    const base = `control.${roomB64}.${exp}`;
    const signature = createHmac('sha256', secret).update(base).digest('hex');
    return `${base}.${signature}`;
  }

  private async sfuControl(roomId: string, action: 'start' | 'stop', body?: Record<string, unknown>) {
    const base = (process.env.SFU_CONTROL_URL ?? 'http://localhost:8445').replace(/\/+$/, '');
    const res = await fetch(`${base}/rooms/${roomId}/recording/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sfu-control-token': this.sfuControlToken(roomId),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`SFU recording ${action} failed: ${res.status} ${text}`);
    }
    return res.json().catch(() => ({}));
  }

  async setRecording(ctx: OrganisationContextValue, meetingId: string, recording: boolean) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const meeting = await this.getById(ctx, meetingId);
    if (userId !== meeting.createdBy) throw new ForbiddenException('Only the meeting creator can control recording');

    let uploadedFiles: unknown[] = [];
    if (recording) {
      if (meeting.isRecording) throw new ConflictException('Recording already in progress');
      await this.sfuControl(meetingId, 'start', { organisation_id: ctx.organisationId, actor_id: userId });
    } else if (meeting.isRecording) {
      const result = (await this.sfuControl(meetingId, 'stop')) as { files?: unknown[] };
      uploadedFiles = result.files ?? [];
    }

    const eventType = recording ? Subjects.MEETING_RECORDING_STARTED : Subjects.MEETING_RECORDING_STOPPED;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.meeting.update({
        where: { id: meetingId },
        data: { isRecording: recording, recordingEgressId: null, updatedAt: new Date() },
      });
      const payload = { meetingId, roomName: meeting.roomName, isRecording: recording, recordedBy: userId, files: uploadedFiles };
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

      if (!recording && meeting.type === 'interview' && meeting.interviewSessionId) {
        const transcriptEnvelope = createEventEnvelope({
          eventType: Subjects.MEETING_RECORDING_TRANSCRIPT_READY,
          organisationId: ctx.organisationId,
          actorId: userId,
          resourceType: 'interview-session',
          resourceId: meeting.interviewSessionId,
          correlationId: ctx.correlationId,
          payload: {
            meetingId,
            interviewSessionId: meeting.interviewSessionId,
            roomName: meeting.roomName,
            recordedBy: userId,
            files: uploadedFiles,
          },
        });
        await this.outbox.createEvent(tx, transcriptEnvelope, Subjects.MEETING_RECORDING_TRANSCRIPT_READY);
      }

      return updated;
    });
  }

  async deleteEnded(ctx: OrganisationContextValue, workspaceId?: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const where: Prisma.MeetingWhereInput = {
      organisationId: ctx.organisationId,
      status: 'ended',
      createdBy: userId,
    };
    if (workspaceId !== undefined) {
      where.workspaceId = workspaceId || null;
    }

    const { count } = await this.prisma.meeting.deleteMany({ where });

    return { deleted: count };
  }
}
