import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'node:stream';

export interface StorageKeyInput {
  organisationId: string;
  category: string;
  fileName: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET', 'teamspace-one');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const region = this.config.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY', 'minioadmin');
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY', 'minioadmin');
    this.publicBaseUrl = this.config.get<string>('S3_PUBLIC_BASE_URL');

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket ${this.bucket} exists`);
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created S3 bucket ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Could not create S3 bucket: ${(err as Error).message}`);
      }
    }
  }

  buildStorageKey(input: StorageKeyInput): string {
    const normalised = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `organisations/${input.organisationId}/${input.category}/${Date.now()}-${normalised}`;
  }

  async uploadBuffer(key: string, buffer: Buffer, mimeType: string): Promise<{ etag: string }> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      },
    });
    const result = await upload.done();
    return { etag: result.ETag ?? '' };
  }

  async uploadStream(key: string, stream: Readable, mimeType: string, length?: number): Promise<{ etag: string }> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream,
        ContentType: mimeType,
        ContentLength: length,
      },
    });
    const result = await upload.done();
    return { etag: result.ETag ?? '' };
  }

  async getSignedUploadUrl(key: string, mimeType: string, expirySeconds = 300): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expirySeconds });
  }

  async getSignedDownloadUrl(key: string, expirySeconds = 300): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expirySeconds });
  }

  getPublicUrl(key: string): string | undefined {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    if (endpoint) {
      return `${endpoint}/${this.bucket}/${key}`;
    }
    return undefined;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getBucket(): string {
    return this.bucket;
  }
}
