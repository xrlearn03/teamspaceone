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
      S3_BUCKET: 'teamspace-one',
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

  it('should build user- and type-scoped storage keys inside the org folder', () => {
    const input: StorageKeyInput = {
      organisationId: 'org-123',
      uploaderId: 'user-1',
      mimeType: 'application/pdf',
      fileName: 'my file.pdf',
    };
    const key = service.buildStorageKey(input);
    expect(key).toMatch(/^organisations\/org-123\/users\/user-1\/documents\/\d+-my_file\.pdf$/);
  });

  it('should group keys by file type folder', () => {
    const key = service.buildStorageKey({
      organisationId: 'org-1',
      uploaderId: 'u1',
      mimeType: 'image/png',
      fileName: 'pic.png',
    });
    expect(key).toMatch(/^organisations\/org-1\/users\/u1\/images\/\d+-pic\.png$/);
  });

  it('should return a signed upload url', async () => {
    const result = await service.getSignedUploadUrl('organisations/org-1/attachments/f.png', 'image/png');
    expect(result.url).toBe('http://signed-url');
    expect(result.headers).toEqual({});
  });

  it('should include a checksum header when a sha256 is provided', async () => {
    const sha256Hex = 'a'.repeat(64);
    const base64 = Buffer.from(sha256Hex, 'hex').toString('base64');
    const result = await service.getSignedUploadUrl('organisations/org-1/attachments/f.png', 'image/png', 300, {
      checksumSha256Base64: base64,
    });
    expect(result.url).toBe('http://signed-url');
    expect(result.headers['x-amz-checksum-sha256']).toBe(base64);
  });

  it('should return a public url using the configured endpoint', () => {
    const url = service.getPublicUrl('organisations/org-1/attachments/f.png');
    expect(url).toBe('http://localhost:9000/teamspace-one/organisations/org-1/attachments/f.png');
  });
});
