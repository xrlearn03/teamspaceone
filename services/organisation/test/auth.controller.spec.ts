import { Test, TestingModule } from '@nestjs/testing';
import { OrganisationController } from '../src/organisation/organisation.controller.js';
import { OrganisationService } from '../src/organisation/organisation.service.js';

describe('OrganisationController', () => {
  let controller: OrganisationController;

  const mockService = {
    create: jest.fn().mockResolvedValue({
      organisation: { id: 'org-1', name: 'Acme', slug: 'acme', ownerId: 'user-1' },
      membership: { id: 'mem-1', userId: 'user-1', organisationId: 'org-1' },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganisationController],
      providers: [{ provide: OrganisationService, useValue: mockService }],
    }).compile();

    controller = module.get<OrganisationController>(OrganisationController);
  });

  it('should create an organisation', async () => {
    const result = await controller.create(
      { name: 'Acme', slug: 'acme' },
      'user-1',
      'corr-1',
    );
    expect(result.organisation.name).toBe('Acme');
    expect(mockService.create).toHaveBeenCalledWith({ name: 'Acme', slug: 'acme' }, 'user-1', 'corr-1');
  });
});
