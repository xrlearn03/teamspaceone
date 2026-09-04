import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from '../src/audit/audit.controller.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AuditController', () => {
  let controller: AuditController;

  const mockPrisma = {
    auditEvent: {
      findMany: jest.fn().mockResolvedValue([{ id: 'a1', eventType: 'teamspace-one.message.created' }]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  it('should list audit events', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.list(ctx);
    expect(result.length).toBe(1);
    expect(mockPrisma.auditEvent.findMany).toHaveBeenCalled();
  });
});
