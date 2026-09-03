import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService, StorageKeyInput } from '../src/storage/storage.service.js';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  HeadBucketCommand: jest.fn(),
  CreateBucketCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('http://signed-url'),
}));

const config = {
  get: (key: string, defaultValue?: unknown) => {
    const values: Record<string, unknown> = {
      S3_BUCKET: 'reactify',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY: 'minioadmin',
      S3_SECRET_KEY: 'minioadmin',
    };
    return values[key] ?? defaultValue;
  },
};

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get<StorageService>(StorageService);
    await service.onModuleInit();
  });

  it('should build organisation-scoped storage keys', () => {
    const input: StorageKeyInput = {
      organisationId: 'org-123',
      category: 'attachments',
      fileName: 'my file.pdf',
    };
    const key = service.buildStorageKey(input);
    expect(key).toMatch(/^organisations\/org-123\/attachments\/\d+-my_file\.pdf$/);
  });

  it('should return a signed upload url', async () => {
    const url = await service.getSignedUploadUrl('organisations/org-1/attachments/f.png', 'image/png');
    expect(url).toBe('http://signed-url');
  });

  it('should return a public url using the configured endpoint', () => {
    const url = service.getPublicUrl('organisations/org-1/attachments/f.png');
    expect(url).toBe('http://localhost:9000/reactify/organisations/org-1/attachments/f.png');
  });
});
