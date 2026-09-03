import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from '../src/search/search.controller.js';
import { SearchService } from '../src/search/search.service.js';

describe('SearchController', () => {
  let controller: SearchController;

  const mockService = {
    search: jest.fn().mockResolvedValue([{ resourceType: 'message', content: 'hello' }]),
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
    const result = (await controller.search(ctx, 'hello')) as any[];
    expect(result.length).toBe(1);
    expect(mockService.search).toHaveBeenCalledWith(ctx, 'hello');
  });
});
