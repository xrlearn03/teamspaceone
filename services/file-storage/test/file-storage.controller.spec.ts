import { Test, TestingModule } from '@nestjs/testing';
import { FileStorageController } from '../src/file-storage/file-storage.controller.js';
import { FileStorageService } from '../src/file-storage/file-storage.service.js';

const ctx = {
  organisationId: 'org-1',
  actorId: 'user-1',
  correlationId: 'corr-1',
} as any;

describe('FileStorageController', () => {
  let controller: FileStorageController;
  const mockService = {
    list: jest.fn().mockResolvedValue([{ id: 'f1', originalName: 'doc.pdf' }]),
    getById: jest.fn().mockResolvedValue({ id: 'f1', originalName: 'doc.pdf' }),
    presignUpload: jest.fn().mockResolvedValue({ id: 'f1', uploadUrl: 'http://signed', storageKey: 'k' }),
    completeUpload: jest.fn().mockResolvedValue({ id: 'f1', status: 'uploaded' }),
    upload: jest.fn().mockResolvedValue({ id: 'f1', originalName: 'file.txt' }),
    delete: jest.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: jest.fn().mockResolvedValue('http://download'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileStorageController],
      providers: [{ provide: FileStorageService, useValue: mockService }],
    }).compile();

    controller = module.get<FileStorageController>(FileStorageController);
    jest.clearAllMocks();
  });

  it('should list files', async () => {
    const result = await controller.list(ctx);
    expect(result.length).toBe(1);
    expect(mockService.list).toHaveBeenCalledWith(ctx);
  });

  it('should presign an upload', async () => {
    const dto = { fileName: 'doc.pdf', mimeType: 'application/pdf', size: 123, category: 'attachments' };
    const result = await controller.presignUpload(ctx, dto);
    expect(result.uploadUrl).toBe('http://signed');
    expect(mockService.presignUpload).toHaveBeenCalledWith(ctx, dto);
  });

  it('should complete an upload', async () => {
    const result = await controller.completeUpload(ctx, 'f1', {});
    expect(result.id).toBe('f1');
    expect(mockService.completeUpload).toHaveBeenCalledWith(ctx, 'f1');
  });

  it('should delete a file', async () => {
    await controller.delete(ctx, 'f1');
    expect(mockService.delete).toHaveBeenCalledWith(ctx, 'f1');
  });
});
