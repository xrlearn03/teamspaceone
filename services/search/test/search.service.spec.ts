/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { Subjects, createEventEnvelope } from '@teamspace-one/event-contracts';
import { SearchController } from '../src/search/search.controller.js';
import { SearchService } from '../src/search/search.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NatsConsumerService } from '../src/events/nats-consumer.service.js';
import { SearchIndexingService } from '../src/search-indexing/search-indexing.service.js';
import { HealthController } from '../src/health/health.controller.js';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      searchDocument: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('upserts a project document', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.PROJECT_CREATED,
      organisationId: 'org-1',
      actorId: 'user-1',
      workspaceId: 'ws-1',
      resourceType: 'project',
      resourceId: 'project-1',
      payload: { id: 'project-1', name: 'Launch', description: 'Q4 launch' },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organisationId: 'org-1',
          resourceType: 'project',
          resourceId: 'project-1',
          title: 'Launch',
          content: 'Launch Q4 launch',
        }),
      }),
    );
  });

  it('removes a message document on delete', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.MESSAGE_DELETED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'message',
      resourceId: 'msg-1',
      payload: { id: 'msg-1' },
    });

    await service.remove(prisma, envelope);

    expect(prisma.searchDocument.deleteMany).toHaveBeenCalledWith({
      where: { resourceType: 'message', resourceId: 'msg-1', organisationId: 'org-1' },
    });
  });

  it('removes project children when a project is deleted', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.PROJECT_DELETED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'project',
      resourceId: 'project-1',
      payload: { id: 'project-1' },
    });

    await service.remove(prisma, envelope);

    expect(prisma.searchDocument.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        organisationId: 'org-1',
        resourceType: { in: ['task', 'project-comment', 'approval'] },
        permissions: { path: ['projectId'], equals: 'project-1' },
      },
    });
  });

  it('removes channel messages when a channel is deleted', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.CHANNEL_DELETED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'channel',
      resourceId: 'channel-1',
      payload: { id: 'channel-1' },
    });

    await service.remove(prisma, envelope);

    expect(prisma.searchDocument.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        organisationId: 'org-1',
        resourceType: 'message',
        permissions: { path: ['channelId'], equals: 'channel-1' },
      },
    });
  });

  it('updates private channel membership and its indexed messages', async () => {
    prisma.searchDocument.findFirst.mockResolvedValue({
      title: 'Private',
      content: 'Private channel',
      workspaceId: 'ws-1',
      permissions: { visibility: 'private', channelType: 'private', actorIds: ['user-1', 'user-2'] },
    });
    const envelope = createEventEnvelope({
      eventType: Subjects.CHANNEL_MEMBERS_UPDATED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'channel',
      resourceId: 'channel-1',
      payload: { id: 'channel-1', memberIds: ['user-1', 'user-3'] },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          permissions: expect.objectContaining({ actorIds: ['user-1', 'user-3'], visibility: 'private' }),
        }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`"resourceType" = 'message'`),
      JSON.stringify(['user-1', 'user-3']),
      'private',
      'org-1',
      'channel-1',
    );
  });

  it('removes a soft-deleted task instead of indexing an empty document', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.TASK_UPDATED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'task',
      resourceId: 'task-1',
      payload: { id: 'task-1', deleted: true },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.deleteMany).toHaveBeenCalledWith({
      where: { resourceType: 'task', resourceId: 'task-1', organisationId: 'org-1' },
    });
    expect(prisma.searchDocument.upsert).not.toHaveBeenCalled();
  });

  it('updates project membership on the project and indexed tasks', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.PROJECT_UPDATED,
      organisationId: 'org-1',
      actorId: 'owner-1',
      resourceType: 'project',
      resourceId: 'project-1',
      payload: {
        id: 'project-1',
        name: 'Launch',
        ownerId: 'owner-1',
        members: [{ userId: 'owner-1' }, { userId: 'member-1' }],
      },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          permissions: expect.objectContaining({ visibility: 'project', actorIds: ['owner-1', 'member-1'] }),
        }),
      }),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`"resourceType" = 'task'`),
      JSON.stringify(['owner-1', 'member-1']),
      'org-1',
      'project-1',
    );
  });

  it('preserves meeting details when a participant joins', async () => {
    prisma.searchDocument.findFirst.mockResolvedValue({
      title: 'Planning',
      content: 'Planning roadmap',
      workspaceId: 'ws-1',
      metadata: { status: 'started', startedAt: '2026-09-08T10:00:00.000Z' },
      permissions: { visibility: 'private', ownerId: 'owner-1', actorIds: ['owner-1'], participantIds: [] },
    });
    const envelope = createEventEnvelope({
      eventType: Subjects.MEETING_PARTICIPANT_JOINED,
      organisationId: 'org-1',
      actorId: 'member-1',
      resourceType: 'meeting_participant',
      resourceId: 'participant-1',
      payload: { meetingId: 'meeting-1', userId: 'member-1' },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          title: 'Planning',
          content: 'Planning roadmap',
          permissions: expect.objectContaining({
            ownerId: 'owner-1',
            actorIds: ['owner-1', 'member-1'],
            participantIds: ['member-1'],
          }),
        }),
      }),
    );
  });

  it('indexes user names from auth event fields', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.USER_CREATED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'user',
      resourceId: 'user-2',
      payload: { id: 'user-2', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ title: 'Ada Lovelace', content: 'Ada Lovelace ada@example.com' }),
      }),
    );
  });

  it('indexes project comments with project membership', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.PROJECT_COMMENT_CREATED,
      organisationId: 'org-1',
      actorId: 'author-1',
      resourceType: 'project-comment',
      resourceId: 'comment-1',
      payload: { id: 'comment-1', projectId: 'project-1', authorId: 'author-1', content: 'Ship it', memberIds: ['author-1', 'member-1'] },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        resourceType: 'project-comment',
        content: 'Ship it',
        permissions: expect.objectContaining({ projectId: 'project-1', actorIds: ['author-1', 'member-1'] }),
      }),
    }));
  });

  it('indexes interview sessions for organizers and participants', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.INTERVIEW_SESSION_SCHEDULED,
      organisationId: 'org-1',
      actorId: 'organizer-1',
      resourceType: 'interview_session',
      resourceId: 'session-1',
      payload: {
        sessionId: 'session-1',
        candidateName: 'Grace Hopper',
        candidateEmail: 'grace@example.com',
        jobTitle: 'Engineer',
        organizerId: 'organizer-1',
        participantIds: ['interviewer-1'],
      },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        resourceType: 'interview-session',
        title: 'Interview: Grace Hopper',
        permissions: expect.objectContaining({ actorIds: ['organizer-1', 'interviewer-1'] }),
      }),
    }));
  });

  it('preserves user names on partial user updates', async () => {
    prisma.searchDocument.findFirst.mockResolvedValue({
      title: 'Ada Lovelace',
      content: 'Ada Lovelace old@example.com',
      metadata: { firstName: 'Ada', lastName: 'Lovelace', email: 'old@example.com' },
      permissions: { visibility: 'public', actorIds: ['user-2'], ownerId: 'user-2' },
    });
    const envelope = createEventEnvelope({
      eventType: Subjects.USER_UPDATED,
      organisationId: 'org-1',
      actorId: 'user-2',
      resourceType: 'user',
      resourceId: 'user-2',
      payload: { id: 'user-2', email: 'new@example.com', activated: true },
    });

    await service.upsert(prisma, envelope);

    expect(prisma.searchDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        title: 'Ada Lovelace',
        content: 'Ada Lovelace new@example.com',
        metadata: expect.objectContaining({ firstName: 'Ada', lastName: 'Lovelace', email: 'new@example.com' }),
      }),
    }));
  });

  it('does not broaden team-scoped access to the whole organisation', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' };
    const user = {
      id: 'user-1',
      organisationId: 'org-1',
      permissions: ['hrms.employee.view'],
      dataScopes: [{ module: 'hrms', scope: 'team', scopeValue: 'team-1' }],
    } as any;

    await service.search(ctx, '', undefined, user);

    const [, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(params).not.toContain('employee');
  });

  it('builds an IN clause for multiple resource types', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' };

    await service.search(ctx, '', { resourceTypes: ['project', 'task'] });

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('"resourceType" IN ($2, $3)'),
      'org-1',
      'project',
      'task',
      'public',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      50,
      0,
    );
  });

  it('clamps pagination supplied outside the HTTP controller', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' };

    await service.search(ctx, '', { limit: 1000, offset: 999999 });

    const params = prisma.$queryRawUnsafe.mock.calls[0].slice(1);
    expect(params.slice(-2)).toEqual([100, 10000]);
  });

  it('builds permission-aware search SQL', async () => {
    prisma.$queryRawUnsafe = jest.fn().mockResolvedValue([
      {
        id: 'doc-1',
        resourceType: 'message',
        resourceId: 'msg-1',
        title: null,
        content: 'hello world',
        organisationId: 'org-1',
        workspaceId: null,
        permissions: { visibility: 'public', actorIds: [] },
      },
    ]);

    const ctx = { organisationId: 'org-1', actorId: 'user-1', correlationId: 'corr-1' };
    const result = await service.search(ctx, 'hello', { resourceType: 'message' });

    expect(result.length).toBe(1);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('to_tsvector'),
      'org-1',
      'message',
      'public',
      'user-1',
      'user-1',
      'user-1',
      'user-1',
      expect.any(String),
      50,
      0,
    );
  });
});

describe('SearchController', () => {
  let controller: SearchController;

  const mockService = {
    search: jest.fn().mockResolvedValue([{ resourceType: 'message', content: 'hello' }]),
    getByResource: jest.fn().mockResolvedValue({ resourceType: 'message', resourceId: 'msg-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockService }],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should search', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = (await controller.search(ctx, { q: 'hello' }, { user: undefined })) as any[];
    expect(result.length).toBe(1);
    expect(mockService.search).toHaveBeenCalledWith(ctx, 'hello', expect.any(Object), undefined);
  });

  it('accepts repeated resource type filters', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;

    await controller.search(ctx, { q: 'launch', type: ['project', 'task'] }, { user: undefined });

    expect(mockService.search).toHaveBeenLastCalledWith(ctx, 'launch', expect.objectContaining({
      resourceTypes: ['project', 'task'],
    }), undefined);
  });

  it('rejects malformed and inverted query parameters', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    await expect(controller.search(ctx, { q: ['invalid'] as any }, { user: undefined })).rejects.toThrow('q must be a string');
    await expect(controller.search(ctx, {
      from: '2026-09-09T00:00:00.000Z',
      to: '2026-09-08T00:00:00.000Z',
    }, { user: undefined })).rejects.toThrow('from must be before or equal to to');
  });

  it('should get by resource', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const user = { id: 'user-1', permissions: [] } as any;
    await controller.getByResource(ctx, 'message', 'msg-1', { user });
    expect(mockService.getByResource).toHaveBeenCalledWith(ctx, 'message', 'msg-1', user);
  });
});

describe('SearchIndexingService', () => {
  it('removes completed jobs so the same resource can be reindexed again', async () => {
    const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const service = new SearchIndexingService({} as any, {} as any, queue as any);
    const job = {
      eventType: Subjects.PROJECT_UPDATED,
      organisationId: 'org-1',
      resourceType: 'project',
      resourceId: 'project-1',
      payload: { id: 'project-1', name: 'Launch' },
    };

    await service.enqueue(job);

    expect(queue.add).toHaveBeenCalledWith('reindex', job, expect.objectContaining({
      jobId: 'reindex-org-1-project-project-1',
      removeOnComplete: true,
      removeOnFail: { age: 604800, count: 1000 },
    }));
  });
});

describe('HealthController', () => {
  it('returns readiness when database and NATS are available', async () => {
    const controller = new HealthController(
      { healthCheck: jest.fn().mockResolvedValue(undefined) } as any,
      { isConnected: jest.fn().mockReturnValue(true) } as any,
    );

    await expect(controller.ready()).resolves.toEqual({ status: 'ok', db: true, nats: true });
  });

  it('returns HTTP 503 readiness when a dependency is unavailable', async () => {
    const controller = new HealthController(
      { healthCheck: jest.fn().mockRejectedValue(new Error('database unavailable')) } as any,
      { isConnected: jest.fn().mockReturnValue(true) } as any,
    );

    await expect(controller.ready()).rejects.toMatchObject({ status: 503 });
  });
});

describe('NatsConsumerService', () => {
  it('keeps the source message recoverable when DLQ publishing fails', async () => {
    const envelope = createEventEnvelope({
      eventType: Subjects.PROJECT_UPDATED,
      organisationId: 'org-1',
      actorId: 'user-1',
      resourceType: 'project',
      resourceId: 'project-1',
      payload: { id: 'project-1' },
    });
    const natsClient = {
      getJetStream: jest.fn().mockResolvedValue({ publish: jest.fn().mockRejectedValue(new Error('NATS unavailable')) }),
    };
    const inbox = { handle: jest.fn().mockRejectedValue(new Error('indexing failed')) };
    const service = new NatsConsumerService(natsClient as any, inbox as any, {} as any, {} as any);
    const msg = {
      json: jest.fn().mockReturnValue(envelope),
      info: { deliveryCount: 5 },
      ack: jest.fn(),
      nak: jest.fn(),
      term: jest.fn(),
    };

    await (service as any).handleMessage(msg);

    expect(msg.nak).toHaveBeenCalledWith(5000);
    expect(msg.term).not.toHaveBeenCalled();
  });
});
