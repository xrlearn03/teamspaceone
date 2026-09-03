import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { TemplateService } from '../src/template/template.service.js';
import { NatsClientService } from '../src/events/nats-client.service.js';

describe('TemplateService', () => {
  let service: TemplateService;

  const mockPrisma = {
    $transaction: jest.fn(async (fn: any) => {
      const tx = {
        templateEntity: { create: jest.fn().mockResolvedValue({ id: '1', name: 'Test', organisationId: 'org-1' }) },
      };
      return fn(tx);
    }),
    templateEntity: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockOutbox = {
    createEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockNats = {
    getJetStream: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: NatsClientService, useValue: mockNats },
      ],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
  });

  it('should create an entity and schedule an outbox event in one transaction', async () => {
    const result = await service.createEntity({
      organisationId: 'org-1',
      actorId: 'user-1',
      name: 'Test Entity',
    });

    expect(result.entity).toBeDefined();
    expect(result.event).toBeDefined();
    expect(result.event.organisationId).toBe('org-1');
    expect(result.event.eventType).toBe('reactify.template.created');
    expect(mockOutbox.createEvent).toHaveBeenCalled();
  });
});
