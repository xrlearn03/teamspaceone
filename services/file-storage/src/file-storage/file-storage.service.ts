import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { StorageService } from '../storage/storage.service.js';
import { FileProcessingService } from '../file-processing/file-processing.service.js';
import { type PresignUploadDto } from './dto/presign-upload.dto.js';

export interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PresignUploadResult {
  id: string;
  uploadUrl: string;
  storageKey: string;
}

export interface FileRecordResult {
  id: string;
  organisationId: string;
  workspaceId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  category: string;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  size: number;
  bucket: string;
  storageKey: string;
  url: string | null;
  etag: string | null;
  status: string;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  downloadUrl?: string;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly processing: FileProcessingService,
  ) {}

  private withSignedUrl(record: { storageKey: string } & Record<string, unknown>): FileRecordResult {
    return {
      ...record,
      downloadUrl: this.storage.getPublicUrl(record.storageKey),
    } as FileRecordResult;
  }

  async list(ctx: OrganisationContextValue): Promise<FileRecordResult[]> {
    const records = await this.prisma.fileRecord.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.withSignedUrl(r));
  }

  async getById(ctx: OrganisationContextValue, id: string): Promise<FileRecordResult> {
    const record = await this.prisma.fileRecord.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!record) {
      throw new NotFoundException('File not found');
    }
    const signedUrl = await this.storage.getSignedDownloadUrl(record.storageKey);
    return { ...this.withSignedUrl(record), downloadUrl: signedUrl };
  }

  async presignUpload(ctx: OrganisationContextValue, dto: PresignUploadDto): Promise<PresignUploadResult> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    const id = randomUUID();
    const storageKey = this.storage.buildStorageKey({
      organisationId: ctx.organisationId,
      category: dto.category,
      fileName: dto.fileName,
    });

    const uploadUrl = await this.storage.getSignedUploadUrl(storageKey, dto.mimeType);

    await this.prisma.fileRecord.create({
      data: {
        id,
        organisationId: ctx.organisationId,
        workspaceId: dto.workspaceId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        category: dto.category,
        uploaderId: actorId,
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        size: dto.size,
        bucket: this.storage.getBucket(),
        storageKey,
        status: 'pending',
      },
    });

    return { id, uploadUrl, storageKey };
  }

  async completeUpload(
    ctx: OrganisationContextValue,
    id: string,
  ): Promise<FileRecordResult> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    const existing = await this.prisma.fileRecord.findFirst({
      where: { id, organisationId: ctx.organisationId, uploaderId: actorId },
    });
    if (!existing) {
      throw new NotFoundException('File not found');
    }

    const exists = await this.storage.exists(existing.storageKey);
    if (!exists) {
      throw new NotFoundException('Object not found in storage');
    }

    const publicUrl = this.storage.getPublicUrl(existing.storageKey);

    const payload = {
      id,
      organisationId: ctx.organisationId,
      workspaceId: existing.workspaceId,
      resourceType: existing.resourceType,
      resourceId: existing.resourceId,
      category: existing.category,
      uploaderId: actorId,
      originalName: existing.originalName,
      mimeType: existing.mimeType,
      size: existing.size,
      storageKey: existing.storageKey,
      bucket: this.storage.getBucket(),
      url: publicUrl,
      status: 'uploaded',
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.FILE_UPLOADED,
      organisationId: ctx.organisationId,
      actorId,
      workspaceId: existing.workspaceId ?? undefined,
      resourceType: 'file',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.fileRecord.update({
        where: { id },
        data: { status: 'uploaded', url: publicUrl },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.FILE_UPLOADED);
      return record;
    });

    this.logger.log({ fileId: id, storageKey: existing.storageKey }, 'File upload completed and event outboxed');

    await this.processing.enqueue({
      fileId: id,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      correlationId: ctx.correlationId,
    });

    return this.withSignedUrl(updated);
  }

  async upload(ctx: OrganisationContextValue, file: MulterFile): Promise<FileRecordResult> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    const id = randomUUID();
    const category = 'attachment';
    const storageKey = this.storage.buildStorageKey({
      organisationId: ctx.organisationId,
      category,
      fileName: file.originalname,
    });

    const { etag } = await this.storage.uploadBuffer(storageKey, file.buffer, file.mimetype);
    const publicUrl = this.storage.getPublicUrl(storageKey);

    const payload = {
      id,
      organisationId: ctx.organisationId,
      workspaceId: null,
      resourceType: null,
      resourceId: null,
      category,
      uploaderId: actorId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      bucket: this.storage.getBucket(),
      storageKey,
      etag,
      url: publicUrl,
      status: 'uploaded',
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.FILE_UPLOADED,
      organisationId: ctx.organisationId,
      actorId,
      resourceType: 'file',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    const record = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.fileRecord.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          category,
          uploaderId: actorId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          bucket: this.storage.getBucket(),
          storageKey,
          etag,
          url: publicUrl,
          status: 'uploaded',
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.FILE_UPLOADED);
      return created;
    });

    await this.processing.enqueue({
      fileId: id,
      organisationId: ctx.organisationId,
      actorId,
      correlationId: ctx.correlationId,
    });

    return this.withSignedUrl(record);
  }

  async delete(ctx: OrganisationContextValue, id: string): Promise<void> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    const record = await this.prisma.fileRecord.findFirst({
      where: { id, organisationId: ctx.organisationId },
      include: { previews: true },
    });
    if (!record) {
      throw new NotFoundException('File not found');
    }

    const envelope = createEventEnvelope({
      eventType: Subjects.FILE_DELETED,
      organisationId: ctx.organisationId,
      actorId,
      resourceType: 'file',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload: {
        id,
        organisationId: ctx.organisationId,
        storageKey: record.storageKey,
        uploaderId: record.uploaderId,
      },
    });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.filePreview.deleteMany({ where: { fileId: id } });
      await tx.fileRecord.delete({ where: { id } });
      await this.outbox.createEvent(tx, envelope, Subjects.FILE_DELETED);
    });

    try {
      await this.storage.delete(record.storageKey);
      for (const preview of record.previews) {
        await this.storage.delete(preview.storageKey);
      }
    } catch (err) {
      this.logger.error({ fileId: id, error: (err as Error).message }, 'Failed to delete storage objects');
    }
  }

  async getSignedDownloadUrl(ctx: OrganisationContextValue, id: string): Promise<string> {
    const record = await this.prisma.fileRecord.findFirst({
      where: { id, organisationId: ctx.organisationId },
    });
    if (!record) {
      throw new NotFoundException('File not found');
    }
    return this.storage.getSignedDownloadUrl(record.storageKey);
  }
}
