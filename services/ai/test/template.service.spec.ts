import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from '../src/ai/ai.controller.js';
import { AiService } from '../src/ai/ai.service.js';

describe('AiController', () => {
  let controller: AiController;

  const mockService = {
    summarize: jest.fn().mockResolvedValue({ result: 'A placeholder summary.', model: 'none' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: mockService }],
    }).compile();

    controller = module.get<AiController>(AiController);
  });

  it('should summarize', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.summarize(ctx, { prompt: 'Summarize this' });
    expect(result.result).toBe('A placeholder summary.');
    expect(mockService.summarize).toHaveBeenCalledWith('Summarize this');
  });
});
