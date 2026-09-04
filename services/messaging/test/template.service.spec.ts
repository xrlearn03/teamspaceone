import { Test, TestingModule } from '@nestjs/testing';
import { MessagingController } from '../src/messaging/messaging.controller.js';
import { MessagingService } from '../src/messaging/messaging.service.js';

describe('MessagingController', () => {
  let controller: MessagingController;

  const mockService = {
    createChannel: jest.fn(),
    createDirectChannel: jest.fn(),
    listChannels: jest.fn(),
    updateChannel: jest.fn(),
    replaceMembers: jest.fn(),
    deleteChannel: jest.fn(),
    listMessages: jest.fn(),
    createMessage: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
  };

  const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagingController],
      providers: [{ provide: MessagingService, useValue: mockService }],
    }).compile();
    controller = module.get<MessagingController>(MessagingController);
  });

  it('creates a channel with members', async () => {
    const dto = { name: 'general', type: 'private' as const, memberIds: ['user-2'] };
    mockService.createChannel.mockResolvedValue({ id: 'ch-1', ...dto });
    await expect(controller.createChannel(ctx, dto)).resolves.toMatchObject({ id: 'ch-1' });
    expect(mockService.createChannel).toHaveBeenCalledWith(ctx, dto);
  });

  it('creates an idempotent direct conversation through the service', async () => {
    const dto = { memberIds: ['user-2'] };
    mockService.createDirectChannel.mockResolvedValue({ id: 'dm-1', type: 'direct' });
    await expect(controller.createDirectChannel(ctx, dto)).resolves.toMatchObject({ type: 'direct' });
    expect(mockService.createDirectChannel).toHaveBeenCalledWith(ctx, dto);
  });

  it('passes cursor pagination to message listing', async () => {
    mockService.listMessages.mockResolvedValue({ items: [], nextCursor: null });
    await controller.listMessages(ctx, 'ch-1', 'message-50', '25');
    expect(mockService.listMessages).toHaveBeenCalledWith(ctx, 'ch-1', 'message-50', 25);
  });

  it('updates and deletes only through actor-scoped service methods', async () => {
    await controller.updateMessage(ctx, 'message-1', { content: 'edited' });
    await controller.deleteMessage(ctx, 'message-1');
    expect(mockService.updateMessage).toHaveBeenCalledWith(ctx, 'message-1', { content: 'edited' });
    expect(mockService.deleteMessage).toHaveBeenCalledWith(ctx, 'message-1');
  });
});
