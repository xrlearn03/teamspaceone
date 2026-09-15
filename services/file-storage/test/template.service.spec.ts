import { Test, TestingModule } from '@nestjs/testing';
import { FileStorageController } from '../src/file-storage/file-storage.controller.js';
import { FileStorageService } from '../src/file-storage/file-storage.service.js';

describe('FileStorageController', () => {
  let controller: FileStorageController;

  const mockService = {
    list: jest.fn().mockResolvedValue([{ id: 'f1', originalName: 'doc.pdf' }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileStorageController],
      providers: [{ provide: FileStorageService, useValue: mockService }],
    }).compile();

    controller = module.get<FileStorageController>(FileStorageController);
  });

  it('should list files', async () => {
    const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;
    const result = await controller.list(ctx);
    expect(result.length).toBe(1);
    expect(mockService.list).toHaveBeenCalledWith(ctx, undefined, undefined, undefined);
  });
});
