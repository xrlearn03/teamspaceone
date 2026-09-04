import { BadRequestException, GoneException, Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { StorageService } from '../storage/storage.service.js';
import { FileProcessingService } from '../file-processing/file-processing.service.js';
import { type PresignUploadDto } from './dto/presign-upload.dto.js';
import { type CreateExternalShareDto } from './dto/create-external-share.dto.js';

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

  async listExternalShares(ctx: OrganisationContextValue, fileId: string) {
    const file = await this.prisma.fileRecord.findFirst({ where: { id: fileId, organisationId: ctx.organisationId } });
    if (!file) throw new NotFoundException('File not found');
    return this.prisma.externalShare.findMany({ where: { fileId, organisationId: ctx.organisationId }, orderBy: { createdAt: 'desc' } });
  }

  async createExternalShare(ctx: OrganisationContextValue, fileId: string, dto: CreateExternalShareDto) {
    const actorId = ctx.actorId;
    if (!actorId) throw new ForbiddenException('Missing actor');
    const file = await this.prisma.fileRecord.findFirst({ where: { id: fileId, organisationId: ctx.organisationId } });
    if (!file) throw new NotFoundException('File not found');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new BadRequestException('Expiry must be a future date');
    if (dto.maxViews !== undefined && (!Number.isInteger(dto.maxViews) || dto.maxViews < 1 || dto.maxViews > 100000)) throw new BadRequestException('maxViews must be between 1 and 100000');
    const id = randomUUID();
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const share = await tx.externalShare.create({ data: { id, fileId, organisationId: ctx.organisationId, token, createdBy: actorId, expiresAt, maxViews: dto.maxViews } });
      const envelope = createEventEnvelope({ eventType: Subjects.FILE_SHARED_EXTERNALLY, organisationId: ctx.organisationId, actorId, resourceType: 'external-share', resourceId: id, correlationId: ctx.correlationId, payload: { shareId: id, fileId, organisationId: ctx.organisationId, token, createdBy: actorId, expiresAt: expiresAt?.toISOString() } });
      await this.outbox.createEvent(tx, envelope, Subjects.FILE_SHARED_EXTERNALLY);
      return share;
    });
  }

  async revokeExternalShare(ctx: OrganisationContextValue, shareId: string): Promise<void> {
    const share = await this.prisma.externalShare.findFirst({ where: { id: shareId, organisationId: ctx.organisationId } });
    if (!share) throw new NotFoundException('Share not found');
    await this.prisma.externalShare.delete({ where: { id: shareId } });
  }

  async redeemExternalShare(token: string) {
    const share = await this.prisma.externalShare.findUnique({ where: { token }, include: { file: true } });
    if (!share) throw new NotFoundException('Share not found');
    if (share.expiresAt && share.expiresAt <= new Date()) throw new GoneException('Share has expired');
    if (share.maxViews !== null && share.viewCount >= share.maxViews) throw new GoneException('Share view limit reached');
    const updated = await this.prisma.externalShare.updateMany({ where: { id: share.id, viewCount: share.viewCount }, data: { viewCount: { increment: 1 } } });
    if (updated.count !== 1) throw new GoneException('Share is no longer available');
    return { fileName: share.file.originalName, mimeType: share.file.mimeType, size: share.file.size, downloadUrl: await this.storage.getSignedDownloadUrl(share.file.storageKey), expiresAt: share.expiresAt, remainingViews: share.maxViews === null ? null : Math.max(share.maxViews - share.viewCount - 1, 0) };
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
