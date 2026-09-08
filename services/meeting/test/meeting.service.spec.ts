import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
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
    });
    txClient.meeting.update.mockResolvedValue({ id: 'm1', status: 'started' });

    const result = await service.start(ctx, 'm1');

    expect(result.status).toBe('started');
    const outboxCall = mockOutbox.createEvent.mock.calls[0][1];
    expect(outboxCall.eventType).toBe(Subjects.MEETING_STARTED);
  });
});
