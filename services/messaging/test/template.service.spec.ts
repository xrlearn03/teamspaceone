import { Test, TestingModule } from '@nestjs/testing';
import { MessagingController } from '../src/messaging/messaging.controller.js';
import { MessagingService } from '../src/messaging/messaging.service.js';

describe('MessagingController', () => {
  let controller: MessagingController;

  const mockService = {
    createChannel: jest.fn().mockResolvedValue({
      id: 'ch-1',
      name: 'general',
      organisationId: 'org-1',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagingController],
      providers: [{ provide: MessagingService, useValue: mockService }],
    }).compile();

    controller = module.get<MessagingController>(MessagingController);
  });

  it('should create a channel', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.createChannel(ctx, { name: 'general' });
    expect(result.name).toBe('general');
    expect(mockService.createChannel).toHaveBeenCalledWith(ctx, { name: 'general' });
  });
});
