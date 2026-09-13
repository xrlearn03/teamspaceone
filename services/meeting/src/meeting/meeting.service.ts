import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { randomUUID, randomInt, createHmac, createHash, timingSafeEqual } from 'node:crypto';
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

/** Unambiguous alphabet for human-typed join codes (no 0/O, 1/I/L). */
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;
const VALID_RECURRENCES = new Set(['daily', 'weekly', 'monthly']);

function randomJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

function nextOccurrenceAfter(from: Date, recurrence: string, after: Date): Date {
  const next = new Date(from);
  while (next.getTime() <= after.getTime()) {
    if (recurrence === 'daily') next.setDate(next.getDate() + 1);
    else if (recurrence === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
  }
  return next;
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
    const invitee = participant ? null : await this.prisma.meetingInvitee.findUnique({ where: { meetingId_userId: { meetingId, userId: actorId } } });
    if (meeting.status === 'ended' && !participant && !invitee && meeting.createdBy !== actorId) return null;
    return { organisationId: meeting.organisationId, workspaceId: meeting.workspaceId };
  }

  private async uniqueJoinCode(organisationId: string): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = randomJoinCode();
      const existing = await this.prisma.meeting.findFirst({
        where: { organisationId, joinCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new ConflictException('Could not allocate a join code');
  }

  async create(ctx: OrganisationContextValue, dto: CreateMeetingDto) {
    const organisationId = ctx.organisationId;
    const createdBy = ctx.actorId;
    if (!createdBy) throw new ForbiddenException('Missing actor');

    if (dto.durationMinutes !== undefined) {
      if (!Number.isFinite(dto.durationMinutes) || dto.durationMinutes < 5 || dto.durationMinutes > 24 * 60) {
        throw new BadRequestException('durationMinutes must be between 5 and 1440');
      }
    }
    const recurrence = dto.recurrence?.toLowerCase() || null;
    if (recurrence && !VALID_RECURRENCES.has(recurrence)) {
      throw new BadRequestException('recurrence must be one of daily, weekly, monthly');
    }
    if (recurrence && !dto.scheduledAt) {
      throw new BadRequestException('Recurring meetings need a scheduledAt');
    }

    const id = randomUUID();
    const roomName = generateRoomName(organisationId, dto.title);
    const joinCode = await this.uniqueJoinCode(organisationId);
    const inviteeIds = [...new Set(dto.inviteeIds ?? [])].filter((userId) => userId && userId !== createdBy);
    const payload = {
      id,
      organisationId,
      workspaceId: dto.workspaceId ?? null,
      roomName,
      title: dto.title,
      description: dto.description ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt).toISOString() : null,
      durationMinutes: dto.durationMinutes ?? null,
      recurrence,
      joinCode,
      inviteeIds,
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
          durationMinutes: dto.durationMinutes ?? null,
          recurrence,
          seriesId: recurrence ? id : null,
          joinCode,
          createdBy,
          invitees: {
            create: inviteeIds.map((userId) => ({
              id: randomUUID(),
              organisationId,
              userId,
            })),
          },
        },
        include: { invitees: true },
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
    const joinCode = await this.uniqueJoinCode(organisationId);
    const inviteeIds = [...new Set(dto.inviteeIds ?? [])].filter((userId) => userId && userId !== createdBy);
    const payload = {
      id,
      organisationId,
      workspaceId: dto.workspaceId ?? null,
      roomName,
      title: dto.title,
      inviteeIds,
      type: 'voice_room',
      joinCode,
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
          joinCode,
          createdBy,
          invitees: {
            create: inviteeIds.map((userId) => ({
              id: randomUUID(),
              organisationId,
              userId,
            })),
          },
        },
        include: { invitees: true },
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
          { invitees: { some: { userId } } },
        ],
      },
      include: { participants: { where: { leftAt: null } }, invitees: true },
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
          { invitees: { some: { userId } } },
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
      include: { participants: { where: { leftAt: null } }, invitees: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const isParticipant = meeting.participants.some((p) => p.userId === userId);
    const isInvitee = meeting.invitees.some((i) => i.userId === userId);
    const isCreator = meeting.createdBy === userId;
    if (!isParticipant && !isInvitee && !isCreator) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  /** Resolve a human-typed join code (e.g. "K7M2P4NQ") to a meeting. */
  async getByCode(ctx: OrganisationContextValue, code: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized) throw new NotFoundException('Meeting not found');
    const meeting = await this.prisma.meeting.findFirst({
      where: { organisationId: ctx.organisationId, joinCode: normalized },
      include: { participants: { where: { leftAt: null } }, invitees: true },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const isParticipant = meeting.participants.some((p) => p.userId === userId);
    const isInvitee = meeting.invitees.some((i) => i.userId === userId);
    const isCreator = meeting.createdBy === userId;
    if (!isParticipant && !isInvitee && !isCreator) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  /**
   * Busy intervals for the given members, for smart scheduling. Only meetings
   * the actor can see are considered — plus the actor's own meetings so their
   * own calendar blocks the suggested slots too.
   */
  async listAvailability(ctx: OrganisationContextValue, userIds: string[], from?: string, to?: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');

    const ids = [...new Set([userId, ...userIds])].filter(Boolean).slice(0, 50);
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(fromDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
      throw new BadRequestException('Invalid availability range');
    }

    const meetings = await this.prisma.meeting.findMany({
      where: {
        organisationId: ctx.organisationId,
        type: 'meeting',
        status: { not: 'ended' },
        scheduledAt: { not: null, lte: toDate },
        OR: [
          { createdBy: { in: ids } },
          { invitees: { some: { userId: { in: ids } } } },
          { participants: { some: { userId: { in: ids }, leftAt: null } } },
        ],
      },
      include: { invitees: true, participants: { where: { leftAt: null } } },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    });

    const intervals: { meetingId: string; startsAt: Date; endsAt: Date; userIds: string[] }[] = [];
    for (const m of meetings) {
      const start = m.status === 'started' && m.startedAt ? m.startedAt : m.scheduledAt!;
      const busyEnd = new Date(start.getTime() + (m.durationMinutes ?? (m.status === 'started' ? 60 : 30)) * 60_000);
      if (busyEnd < fromDate || start > toDate) continue;
      const attendees = this.attendeeIds(m);
      intervals.push({
        meetingId: m.id,
        startsAt: start,
        endsAt: busyEnd,
        userIds: attendees.filter((id) => ids.includes(id)),
      });
    }
    return { intervals };
  }

  private attendeeIds(meeting: { createdBy: string; participants: { userId: string }[]; invitees: { userId: string }[] }) {
    return [
      ...new Set([
        meeting.createdBy,
        ...meeting.invitees.map((i) => i.userId),
        ...meeting.participants.map((p) => p.userId),
      ]),
    ];
  }

  async start(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.getById(ctx, id);
    if (meeting.status === 'started') throw new ConflictException('Meeting already started');

    const payload = {
      id,
      organisationId: ctx.organisationId,
      roomName: meeting.roomName,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt ? meeting.scheduledAt.toISOString() : null,
      attendeeIds: this.attendeeIds(meeting),
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

    if (meeting.recurrence && meeting.scheduledAt && meeting.seriesId) {
      try {
        await this.scheduleNextOccurrence(meeting);
      } catch (err) {
        this.logger.warn(`Failed to schedule next occurrence for ${meeting.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return updated;
  }

  /**
   * Recurring meetings roll forward: when an occurrence ends, create the next
   * one (same series, invitees and settings) unless a future occurrence is
   * already scheduled.
   */
  private async scheduleNextOccurrence(meeting: {
    id: string;
    organisationId: string;
    workspaceId: string | null;
    roomName: string;
    title: string;
    description: string | null;
    scheduledAt: Date | null;
    durationMinutes: number | null;
    recurrence: string | null;
    seriesId: string | null;
    createdBy: string;
    invitees: { userId: string }[];
  }) {
    if (!meeting.scheduledAt || !meeting.recurrence || !meeting.seriesId) return;
    const now = new Date();
    const pending = await this.prisma.meeting.findFirst({
      where: {
        organisationId: meeting.organisationId,
        seriesId: meeting.seriesId,
        status: 'scheduled',
        scheduledAt: { gt: now },
      },
      select: { id: true },
    });
    if (pending) return;

    const nextAt = nextOccurrenceAfter(meeting.scheduledAt, meeting.recurrence, now);
    const id = randomUUID();
    const roomName = generateRoomName(meeting.organisationId, meeting.title);
    const joinCode = await this.uniqueJoinCode(meeting.organisationId);
    const inviteeIds = meeting.invitees.map((i) => i.userId);

    const payload = {
      id,
      organisationId: meeting.organisationId,
      workspaceId: meeting.workspaceId,
      roomName,
      title: meeting.title,
      description: meeting.description,
      scheduledAt: nextAt.toISOString(),
      durationMinutes: meeting.durationMinutes,
      recurrence: meeting.recurrence,
      joinCode,
      inviteeIds,
      type: 'meeting',
      createdBy: meeting.createdBy,
      previousMeetingId: meeting.id,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_CREATED,
      organisationId: meeting.organisationId,
      workspaceId: meeting.workspaceId ?? undefined,
      actorId: meeting.createdBy,
      resourceType: 'meeting',
      resourceId: id,
      payload,
    });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.meeting.create({
        data: {
          id,
          organisationId: meeting.organisationId,
          workspaceId: meeting.workspaceId,
          roomName,
          title: meeting.title,
          description: meeting.description,
          type: 'meeting',
          scheduledAt: nextAt,
          durationMinutes: meeting.durationMinutes,
          recurrence: meeting.recurrence,
          seriesId: meeting.seriesId,
          joinCode,
          createdBy: meeting.createdBy,
          invitees: {
            create: inviteeIds.map((userId) => ({
              id: randomUUID(),
              organisationId: meeting.organisationId,
              userId,
            })),
          },
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_CREATED);
      return created;
    });
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
    return { token: this.signSfuToken(meeting.id, userId), roomId: meeting.id, userId };
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

    return { token: this.signSfuToken(meeting.id, userId), roomId: meeting.id, userId, roomName: meeting.roomName };
  }

  /**
   * Public guest links: the share token is a stateless HMAC over the meeting id
   * and an expiry, signed with SFU_TOKEN_SECRET (domain-separated by the
   * 'guest.' prefix so it can never be confused with a media join token).
   */
  private sfuSecret(): string {
    const secret = process.env.SFU_TOKEN_SECRET;
    if (!secret) throw new Error('SFU_TOKEN_SECRET environment variable is required');
    return secret;
  }

  private signSfuToken(meetingId: string, userId: string): string {
    const ttlSeconds = Number(process.env.SFU_TOKEN_TTL_SECONDS ?? 4 * 60 * 60);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const roomB64 = Buffer.from(meetingId).toString('base64url');
    const userB64 = Buffer.from(userId).toString('base64url');
    const base = `${roomB64}.${userB64}.${exp}`;
    const signature = createHmac('sha256', this.sfuSecret()).update(base).digest('hex');
    return `${base}.${signature}`;
  }

  private signGuestToken(meetingId: string, exp: number): string {
    const base = `${Buffer.from(meetingId).toString('base64url')}.${exp}`;
    const signature = createHmac('sha256', this.sfuSecret()).update(`guest.${base}`).digest('hex');
    return `${base}.${signature}`;
  }

  private verifyGuestToken(token: string): string {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid meeting link');
    const [meetingB64, expRaw, signature] = parts;
    const expected = createHmac('sha256', this.sfuSecret())
      .update(`guest.${meetingB64}.${expRaw}`)
      .digest('hex');
    const provided = Buffer.from(signature ?? '', 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      throw new UnauthorizedException('Invalid meeting link');
    }
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('Meeting link has expired');
    }
    const meetingId = Buffer.from(meetingB64, 'base64url').toString('utf8');
    if (!meetingId) throw new UnauthorizedException('Invalid meeting link');
    return meetingId;
  }

  private async meetingForGuestToken(token: string) {
    const meetingId = this.verifyGuestToken(token);
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async createShareLink(ctx: OrganisationContextValue, id: string) {
    const meeting = await this.getById(ctx, id);
    const dayMs = 24 * 60 * 60 * 1000;
    const scheduledEnd = meeting.scheduledAt ? meeting.scheduledAt.getTime() + dayMs : 0;
    const exp = Math.floor(Math.max(Date.now() + dayMs, scheduledEnd) / 1000);
    const token = this.signGuestToken(meeting.id, exp);
    const baseUrl = (
      process.env.PUBLIC_WEB_URL ??
      process.env.APP_URL ??
      'https://teamspaceone.in'
    ).replace(/\/+$/, '');
    return { url: `${baseUrl}/join/${token}`, token, expiresAt: new Date(exp * 1000).toISOString() };
  }

  async getGuestMeetingInfo(token: string) {
    const meeting = await this.meetingForGuestToken(token);
    if (meeting.status === 'ended') throw new ConflictException('Meeting has ended');
    return {
      meetingId: meeting.id,
      title: meeting.title,
      type: meeting.type,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
    };
  }

  async joinAsGuest(token: string, dto: { name?: string; email?: string }) {
    const name = dto.name?.trim();
    const email = dto.email?.trim().toLowerCase();
    if (!name || name.length > 100) throw new BadRequestException('Name is required');
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }

    const meeting = await this.meetingForGuestToken(token);
    if (meeting.status === 'ended') throw new ConflictException('Meeting has ended');

    const userId = `guest:${createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
    const participantId = randomUUID();
    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_PARTICIPANT_JOINED,
      organisationId: meeting.organisationId,
      actorId: userId,
      resourceType: 'meeting_participant',
      resourceId: participantId,
      payload: {
        participantId,
        meetingId: meeting.id,
        organisationId: meeting.organisationId,
        roomName: meeting.roomName,
        userId,
        identity: name,
        guest: true,
        displayName: name,
        joinedAt: new Date().toISOString(),
      },
    });

    const participant = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId: meeting.id, userId } },
      });
      if (existing) {
        return tx.meetingParticipant.update({
          where: { id: existing.id },
          data: { leftAt: null, guestName: name, updatedAt: new Date() },
        });
      }
      const created = await tx.meetingParticipant.create({
        data: {
          id: participantId,
          meetingId: meeting.id,
          organisationId: meeting.organisationId,
          userId,
          guestName: name,
          guestEmail: email,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.MEETING_PARTICIPANT_JOINED);
      return created;
    });

    return {
      participantId: participant.id,
      roomId: meeting.id,
      userId,
      displayName: name,
      title: meeting.title,
      type: meeting.type,
      token: this.signSfuToken(meeting.id, userId),
    };
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

  /**
   * Called by MeetingScheduler on an interval. Sends a reminder for meetings
   * approaching their scheduledAt, and auto-starts meetings whose scheduledAt
   * has passed so invitees get a "join" notification without a host action.
   * Claims are conditional updateMany calls so multiple replicas won't emit
   * duplicate events.
   */
  async sweepScheduledMeetings() {
    const now = new Date();
    const reminderBeforeMs = Number(process.env.MEETING_REMINDER_BEFORE_MS ?? 15 * 60 * 1000);

    const due = await this.prisma.meeting.findMany({
      where: {
        type: 'meeting',
        status: 'scheduled',
        scheduledAt: { not: null, lte: now },
      },
      include: { participants: { where: { leftAt: null } }, invitees: true },
      take: 50,
    });

    for (const meeting of due) {
      const attendeeIds = this.attendeeIds(meeting);
      const envelope = createEventEnvelope({
        eventType: Subjects.MEETING_STARTED,
        organisationId: meeting.organisationId,
        workspaceId: meeting.workspaceId ?? undefined,
        resourceType: 'meeting',
        resourceId: meeting.id,
        payload: {
          id: meeting.id,
          organisationId: meeting.organisationId,
          roomName: meeting.roomName,
          title: meeting.title,
          scheduledAt: meeting.scheduledAt!.toISOString(),
          attendeeIds,
          startedAt: now.toISOString(),
          autoStarted: true,
        },
      });

      const claimed = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const result = await tx.meeting.updateMany({
          where: { id: meeting.id, status: 'scheduled' },
          data: { status: 'started', startedAt: now },
        });
        if (result.count === 0) return false;
        await this.outbox.createEvent(tx, envelope, Subjects.MEETING_STARTED);
        return true;
      });
      if (claimed) {
        this.logger.log({ meetingId: meeting.id }, 'Auto-started scheduled meeting');
      }
    }

    const upcoming = await this.prisma.meeting.findMany({
      where: {
        type: 'meeting',
        status: 'scheduled',
        reminderSentAt: null,
        scheduledAt: { not: null, gt: now, lte: new Date(now.getTime() + reminderBeforeMs) },
      },
      include: { invitees: true, participants: { where: { leftAt: null } } },
      take: 50,
    });

    for (const meeting of upcoming) {
      const minutesUntil = Math.max(1, Math.round((meeting.scheduledAt!.getTime() - now.getTime()) / 60000));
      const envelope = createEventEnvelope({
        eventType: Subjects.MEETING_REMINDER,
        organisationId: meeting.organisationId,
        workspaceId: meeting.workspaceId ?? undefined,
        resourceType: 'meeting',
        resourceId: meeting.id,
        payload: {
          id: meeting.id,
          organisationId: meeting.organisationId,
          roomName: meeting.roomName,
          title: meeting.title,
          scheduledAt: meeting.scheduledAt!.toISOString(),
          attendeeIds: this.attendeeIds(meeting),
          minutesUntil,
        },
      });

      const claimed = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const result = await tx.meeting.updateMany({
          where: { id: meeting.id, status: 'scheduled', reminderSentAt: null },
          data: { reminderSentAt: now },
        });
        if (result.count === 0) return false;
        await this.outbox.createEvent(tx, envelope, Subjects.MEETING_REMINDER);
        return true;
      });
      if (claimed) {
        this.logger.log({ meetingId: meeting.id, minutesUntil }, 'Sent scheduled-meeting reminder');
      }
    }
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
