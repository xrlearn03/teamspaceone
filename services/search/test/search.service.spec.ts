/// <reference types="jest" />

import { Test, TestingModule } from '@nestjs/testing';
import { Subjects, createEventEnvelope } from '@reactify/event-contracts';
import { SearchController } from '../src/search/search.controller.js';
import { SearchService } from '../src/search/search.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

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
    const result = (await controller.search(ctx, { q: 'hello' })) as any[];
    expect(result.length).toBe(1);
    expect(mockService.search).toHaveBeenCalledWith(ctx, 'hello', expect.any(Object));
  });

  it('should get by resource', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    await controller.getByResource(ctx, 'message', 'msg-1');
    expect(mockService.getByResource).toHaveBeenCalledWith(ctx, 'message', 'msg-1');
  });
});
