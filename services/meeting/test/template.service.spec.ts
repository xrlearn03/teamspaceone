import { Test, TestingModule } from '@nestjs/testing';
import { MeetingController } from '../src/meeting/meeting.controller.js';
import { MeetingService } from '../src/meeting/meeting.service.js';

describe('MeetingController', () => {
  let controller: MeetingController;

  const mockService = {
    create: jest.fn().mockResolvedValue({ id: 'm1', title: 'Standup' }),
  };

  beforeEach(async () => {
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
});
