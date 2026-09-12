import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { MeetingService } from '../src/meeting/meeting.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { Subjects } from '@teamspace-one/event-contracts';

describe('MeetingService', () => {
  let service: MeetingService;

  const mockOutbox = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  const txClient = {
    meeting: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    meetingParticipant: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn((fn: any) => fn(txClient)),
    meeting: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    meetingParticipant: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
      ],
    }).compile();

    service = module.get<MeetingService>(MeetingService);
  });

  it('should create a meeting and save outbox event', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' } as any;
    txClient.meeting.create.mockResolvedValue({ id: 'm1', title: 'Standup' });

    const result = await service.create(ctx, { title: 'Standup' });

    expect(result.title).toBe('Standup');
    expect(txClient.meeting.create).toHaveBeenCalled();
    expect(mockOutbox.createEvent).toHaveBeenCalled();
    const outboxCall = mockOutbox.createEvent.mock.calls[0][1];
    expect(outboxCall.eventType).toBe(Subjects.MEETING_CREATED);
  });

  it('should reject create without actor', async () => {
    const ctx = { organisationId: 'org-1', correlationId: 'corr-1' } as any;
    await expect(service.create(ctx, { title: 'Standup' })).rejects.toThrow(ForbiddenException);
  });

  it('should create a participant on join', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' } as any;
    mockPrisma.meeting.findFirst.mockResolvedValue({
      id: 'm1',
      roomName: 'room-1',
      status: 'started',
      createdBy: 'user-1',
      participants: [],
      invitees: [],
    });
    txClient.meetingParticipant.findUnique.mockResolvedValue(null);
    txClient.meetingParticipant.create.mockResolvedValue({ id: 'p1', userId: 'user-1' });

    const result = await service.join(ctx, 'm1', {});

    expect(result.participant.id).toBe('p1');
    expect(txClient.meetingParticipant.create).toHaveBeenCalled();
  });

  it('should throw if joining an ended meeting', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' } as any;
    mockPrisma.meeting.findFirst.mockResolvedValue({
      id: 'm1',
      roomName: 'room-1',
      status: 'ended',
      createdBy: 'user-1',
      participants: [],
      invitees: [],
    });

    await expect(service.join(ctx, 'm1', {})).rejects.toThrow(ConflictException);
  });

  it('should start a meeting and publish event', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' } as any;
    mockPrisma.meeting.findFirst.mockResolvedValue({
      id: 'm1',
      roomName: 'room-1',
      status: 'scheduled',
      createdBy: 'user-1',
      participants: [],
      invitees: [],
    });
    txClient.meeting.update.mockResolvedValue({ id: 'm1', status: 'started' });

    const result = await service.start(ctx, 'm1');

    expect(result.status).toBe('started');
    const outboxCall = mockOutbox.createEvent.mock.calls[0][1];
    expect(outboxCall.eventType).toBe(Subjects.MEETING_STARTED);
  });

  describe('guest links', () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' } as any;
    const meeting = {
      id: 'm1',
      roomName: 'room-1',
      title: 'Standup',
      type: 'meeting',
      status: 'started',
      createdBy: 'user-1',
      organisationId: 'org-1',
      participants: [],
      invitees: [],
      scheduledAt: null,
    };

    beforeEach(() => {
      process.env.SFU_TOKEN_SECRET = 'test-guest-secret';
      process.env.PUBLIC_WEB_URL = 'https://web.example.com';
      mockPrisma.meeting.findFirst.mockResolvedValue(meeting);
      mockPrisma.meeting.findUnique.mockResolvedValue(meeting);
    });

    afterEach(() => {
      delete process.env.PUBLIC_WEB_URL;
    });

    it('createShareLink returns a signed url pointing at the web app', async () => {
      const res = await service.createShareLink(ctx, 'm1');
      expect(res.url).toMatch(/^https:\/\/web\.example\.com\/join\//);
      expect(res.token.split('.')).toHaveLength(3);
    });

    it('joinAsGuest creates a guest participant and issues an SFU token', async () => {
      const { token } = await service.createShareLink(ctx, 'm1');
      txClient.meetingParticipant.findUnique.mockResolvedValue(null);
      txClient.meetingParticipant.create.mockResolvedValue({ id: 'p1', userId: 'guest:x' });

      const res = await service.joinAsGuest(token, { name: 'Jane', email: 'jane@example.com' });

      expect(res.userId).toMatch(/^guest:[a-f0-9]{24}$/);
      expect(res.displayName).toBe('Jane');
      expect(res.roomId).toBe('m1');
      expect(res.token.split('.')).toHaveLength(4);
      expect(txClient.meetingParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ guestName: 'Jane', guestEmail: 'jane@example.com' }),
        }),
      );
      const outboxCall = mockOutbox.createEvent.mock.calls.at(-1)?.[1];
      expect(outboxCall.eventType).toBe(Subjects.MEETING_PARTICIPANT_JOINED);
      expect(outboxCall.payload.guest).toBe(true);
    });

    it('rejoining with the same email updates the existing guest participant', async () => {
      const { token } = await service.createShareLink(ctx, 'm1');
      txClient.meetingParticipant.findUnique.mockResolvedValue({ id: 'p1', leftAt: new Date() });
      txClient.meetingParticipant.update.mockResolvedValue({ id: 'p1' });

      const res = await service.joinAsGuest(token, { name: 'Jane', email: 'jane@example.com' });

      expect(res.participantId).toBe('p1');
      expect(txClient.meetingParticipant.update).toHaveBeenCalled();
      expect(txClient.meetingParticipant.create).not.toHaveBeenCalled();
    });

    it('rejects tampered and malformed tokens', async () => {
      const { token } = await service.createShareLink(ctx, 'm1');
      await expect(service.getGuestMeetingInfo(`${token}x`)).rejects.toThrow(UnauthorizedException);
      await expect(service.getGuestMeetingInfo('not-a-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects expired tokens', async () => {
      const { token } = await service.createShareLink(ctx, 'm1');
      const [meetingB64] = token.split('.');
      const expired = `${meetingB64}.${Math.floor(Date.now() / 1000) - 10}.${token.split('.')[2]}`;
      await expect(service.getGuestMeetingInfo(expired)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects joining an ended meeting as a guest', async () => {
      const { token } = await service.createShareLink(ctx, 'm1');
      mockPrisma.meeting.findUnique.mockResolvedValue({ ...meeting, status: 'ended' });
      await expect(
        service.joinAsGuest(token, { name: 'Jane', email: 'jane@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects invalid guest details', async () => {
      const { token } = await service.createShareLink(ctx, 'm1');
      await expect(service.joinAsGuest(token, { name: '', email: 'jane@example.com' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.joinAsGuest(token, { name: 'Jane', email: 'nope' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
