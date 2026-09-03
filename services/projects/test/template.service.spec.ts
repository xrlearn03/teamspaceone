import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from '../src/projects/projects.controller.js';
import { ProjectsService } from '../src/projects/projects.service.js';

describe('ProjectsController', () => {
  let controller: ProjectsController;

  const mockService = {
    createProject: jest.fn().mockResolvedValue({
      id: 'p-1',
      name: 'Sprint 1',
      organisationId: 'org-1',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: mockService }],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should create a project', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.createProject(ctx, { name: 'Sprint 1' });
    expect(result.name).toBe('Sprint 1');
    expect(mockService.createProject).toHaveBeenCalledWith(ctx, { name: 'Sprint 1' });
  });
});
