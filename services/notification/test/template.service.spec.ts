import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from '../src/notification/notification.controller.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('NotificationController', () => {
  let controller: NotificationController;

  const mockPrisma = {
    notification: {
      findMany: jest.fn().mockResolvedValue([{ id: 'n1', read: false }]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it('should list notifications', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.list(ctx);
    expect(result.length).toBe(1);
    expect(mockPrisma.notification.findMany).toHaveBeenCalled();
  });
});
