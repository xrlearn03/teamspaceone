import { Test, TestingModule } from '@nestjs/testing';
import { MeetingController } from '../src/meeting/meeting.controller.js';
import { MeetingService } from '../src/meeting/meeting.service.js';

describe('MeetingController', () => {
  let controller: MeetingController;

  const mockService = {
    create: jest.fn().mockResolvedValue({ id: 'm1', title: 'Standup' }),
    createVoiceRoom: jest.fn().mockResolvedValue({ id: 'v1', title: 'Voice' }),
    list: jest.fn().mockResolvedValue([{ id: 'm1' }]),
    getById: jest.fn().mockResolvedValue({ id: 'm1' }),
    start: jest.fn().mockResolvedValue({ id: 'm1', status: 'started' }),
    end: jest.fn().mockResolvedValue({ id: 'm1', status: 'ended' }),
    join: jest.fn().mockResolvedValue({ participant: { id: 'p1' } }),
    leave: jest.fn().mockResolvedValue({ id: 'p1', leftAt: new Date() }),
    setScreenShare: jest.fn().mockResolvedValue({ id: 'p1', isScreenSharing: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingController],
      providers: [{ provide: MeetingService, useValue: mockService }],
    }).compile();

    controller = module.get<MeetingController>(MeetingController);
  });

  it('should create a meeting', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.create(ctx, { title: 'Standup' });
    expect(result.title).toBe('Standup');
    expect(mockService.create).toHaveBeenCalledWith(ctx, { title: 'Standup' });
  });

  it('should create a voice room', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.createVoiceRoom(ctx, { title: 'Voice' });
    expect(result.title).toBe('Voice');
  });

  it('should start a meeting', async () => {
    const ctx = { organisationId: 'org-1' } as any;
    const result = await controller.start(ctx, 'm1');
    expect(result.status).toBe('started');
  });

  it('should join a meeting', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.join(ctx, 'm1', { name: 'Alice' });
    expect(result.participant.id).toBe('p1');
    expect(mockService.join).toHaveBeenCalledWith(ctx, 'm1', { name: 'Alice' });
  });
});
