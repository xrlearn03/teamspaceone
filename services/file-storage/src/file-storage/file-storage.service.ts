import { BadRequestException, GoneException, Injectable, NotFoundException, ForbiddenException, Logger, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { hasPermission, HRMS_PERMISSIONS, type AuthorizableUser } from '@teamspace-one/authorization';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { StorageService } from '../storage/storage.service.js';
import { FileProcessingService } from '../file-processing/file-processing.service.js';
import { type PresignUploadDto } from './dto/presign-upload.dto.js';
import { type CompleteUploadDto } from './dto/complete-upload.dto.js';
import { type CreateExternalShareDto } from './dto/create-external-share.dto.js';
import { type CreateFolderDto } from './dto/create-folder.dto.js';

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
  uploadHeaders: Record<string, string>;
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
  checksumSha256: string | null;
  status: string;
  version: number;
  versionGroupId: string | null;
  folderId: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  downloadUrl?: string;
}

/**
 * Resource types that carry a membership/ACL check in the owning service.
 * Files linked to these resources are only accessible to actors that can
 * access the resource itself (e.g. channel members for channel files).
 */
const RESOURCE_ACCESS_CHECKS: Record<string, { env: string; path: (resourceId: string, ctx: OrganisationContextValue) => string }> = {
  channel: { env: 'MESSAGING_SERVICE_URL', path: (id) => `/channels/${encodeURIComponent(id)}/access` },
  project: { env: 'PROJECTS_SERVICE_URL', path: (id) => `/projects/${encodeURIComponent(id)}/access` },
  task: { env: 'PROJECTS_SERVICE_URL', path: (id) => `/tasks/${encodeURIComponent(id)}/access` },
  meeting: { env: 'MEETING_SERVICE_URL', path: (id) => `/meetings/${encodeURIComponent(id)}/access` },
  avatar: { env: 'ORGANISATION_SERVICE_URL', path: (id, ctx) => `/organisations/${encodeURIComponent(ctx.organisationId)}/members/${encodeURIComponent(id)}` },
};

/** File statuses that count toward storage quota. 'failed' uploads are excluded. */
const QUOTA_COUNTED_STATUSES = ['pending', 'uploaded', 'processing', 'processed'];
const DEFAULT_PER_USER_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
const MEMBER_COUNT_CACHE_TTL_MS = 30_000;

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private memberCountCache = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly processing: FileProcessingService,
    private readonly config: ConfigService,
  ) {}

  private withSignedUrl(record: { storageKey: string } & Record<string, unknown>): FileRecordResult {
    return {
      ...record,
      downloadUrl: this.storage.getPublicUrl(record.storageKey),
    } as FileRecordResult;
  }

  private categoryPermission(category: string | undefined): string | undefined {
    switch (category) {
      case 'hrms':
        return HRMS_PERMISSIONS.DOCUMENT_UPLOAD;
      default:
        return undefined;
    }
  }

  /**
   * Load a file record and verify the actor may access it. Uploaders always
   * have access to their own files. Files linked to a restricted resource
   * (channel, project, task, meeting) require the actor to have access to that
   * resource — verified via the owning service's `…/:id/access` endpoint.
   */
  private async accessibleRecord(
    ctx: OrganisationContextValue,
    id: string,
    include?: Prisma.FileRecordInclude,
  ): Promise<Prisma.FileRecordGetPayload<{ include: { previews: true } }>> {
    const record = await this.prisma.fileRecord.findFirst({
      where: { id, organisationId: ctx.organisationId },
      ...(include ? { include } : {}),
    });
    if (!record) {
      throw new NotFoundException('File not found');
    }
    await this.assertResourceAccess(ctx, record.resourceType, record.resourceId, record.uploaderId);
    return record as Prisma.FileRecordGetPayload<{ include: { previews: true } }>;
  }

  private async assertResourceAccess(
    ctx: OrganisationContextValue,
    resourceType: string | null,
    resourceId: string | null,
    uploaderId?: string,
  ): Promise<void> {
    const actorId = ctx.actorId;
    if (!actorId) throw new ForbiddenException('Missing actor');
    if (uploaderId && uploaderId === actorId) return;
    if (!resourceType || !resourceId) return;

    const check = RESOURCE_ACCESS_CHECKS[resourceType];
    if (!check) return; // unknown resource types keep organisation-level access

    const baseUrl = this.config.get<string>(check.env);
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!baseUrl || !internalApiKey) {
      throw new ServiceUnavailableException('Resource access checks are not configured');
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${check.path(resourceId, ctx)}`, {
        headers: {
          'x-internal-api-key': internalApiKey,
          'x-internal-caller': 'file-storage-service',
          'x-organisation-id': ctx.organisationId,
          'x-actor-id': actorId,
        },
      });
    } catch {
      throw new ServiceUnavailableException('Resource access check unavailable');
    }
    const access = res.ok ? await res.json().catch(() => null) : null;
    if (!access || (access as { organisationId?: string }).organisationId !== ctx.organisationId) {
      throw new ForbiddenException('You do not have access to this file');
    }
  }

  /** Per-user storage quota in bytes (default 2 GiB), configurable via STORAGE_QUOTA_PER_USER_BYTES. */
  private perUserQuotaBytes(): number {
    const configured = Number(this.config.get<string>('STORAGE_QUOTA_PER_USER_BYTES'));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PER_USER_QUOTA_BYTES;
  }

  /**
   * Organisation member count, resolved from the organisation service and
   * cached briefly. The org quota is `memberCount * perUserQuota`.
   */
  private async getMemberCount(ctx: OrganisationContextValue): Promise<number> {
    const cached = this.memberCountCache.get(ctx.organisationId);
    if (cached && cached.expiresAt > Date.now()) return cached.count;

    const baseUrl = this.config.get<string>('ORGANISATION_SERVICE_URL');
    const internalApiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!baseUrl || !internalApiKey) {
      this.logger.warn('ORGANISATION_SERVICE_URL/INTERNAL_API_KEY not configured; falling back to counting distinct uploaders');
      return this.fallbackMemberCount(ctx.organisationId);
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/organisations/${encodeURIComponent(ctx.organisationId)}/members/count`, {
        headers: {
          'x-internal-api-key': internalApiKey,
          'x-internal-caller': 'file-storage-service',
          'x-organisation-id': ctx.organisationId,
          'x-actor-id': ctx.actorId ?? '',
        },
      });
    } catch {
      this.logger.warn('Organisation member count unavailable; using fallback');
      return this.fallbackMemberCount(ctx.organisationId);
    }
    const body = res.ok ? ((await res.json().catch(() => null)) as { count?: number } | null) : null;
    const count = body && typeof body.count === 'number' && body.count > 0 ? Math.floor(body.count) : await this.fallbackMemberCount(ctx.organisationId);
    this.memberCountCache.set(ctx.organisationId, { count, expiresAt: Date.now() + MEMBER_COUNT_CACHE_TTL_MS });
    return count;
  }

  /** Fallback: distinct uploaders in this org (never less than 1). */
  private async fallbackMemberCount(organisationId: string): Promise<number> {
    const uploaders = await this.prisma.fileRecord.findMany({
      where: { organisationId },
      select: { uploaderId: true },
      distinct: ['uploaderId'],
    });
    return Math.max(uploaders.length, 1);
  }

  private async usageBytes(organisationId: string, uploaderId?: string): Promise<number> {
    const agg = await this.prisma.fileRecord.aggregate({
      _sum: { size: true },
      where: {
        organisationId,
        status: { in: QUOTA_COUNTED_STATUSES },
        ...(uploaderId ? { uploaderId } : {}),
      },
    });
    return agg._sum.size ?? 0;
  }

  /**
   * Enforces storage quota before an upload is accepted:
   *  - per-user: each member may store up to STORAGE_QUOTA_PER_USER_BYTES (default 2 GiB)
   *  - per-organisation: memberCount * per-user quota
   */
  private async assertQuota(ctx: OrganisationContextValue, incomingBytes: number): Promise<void> {
    const actorId = ctx.actorId as string;
    const perUser = this.perUserQuotaBytes();
    const [userUsed, orgUsed] = await Promise.all([
      this.usageBytes(ctx.organisationId, actorId),
      this.usageBytes(ctx.organisationId),
    ]);

    if (userUsed + incomingBytes > perUser) {
      throw new PayloadTooLargeException(
        `Personal storage quota exceeded: ${perUser} bytes allowed per user, ${userUsed} used`,
      );
    }

    const memberCount = await this.getMemberCount(ctx);
    const orgLimit = memberCount * perUser;
    if (orgUsed + incomingBytes > orgLimit) {
      throw new PayloadTooLargeException(
        `Organisation storage quota exceeded: ${orgLimit} bytes allowed for ${memberCount} member(s), ${orgUsed} used`,
      );
    }
  }

  /** Current usage and quota for the actor and their organisation. */
  async getUsage(ctx: OrganisationContextValue) {
    const actorId = ctx.actorId;
    if (!actorId) throw new ForbiddenException('Missing actor');
    const perUser = this.perUserQuotaBytes();
    const [userUsed, orgUsed, memberCount] = await Promise.all([
      this.usageBytes(ctx.organisationId, actorId),
      this.usageBytes(ctx.organisationId),
      this.getMemberCount(ctx),
    ]);
    return {
      perUserQuotaBytes: perUser,
      user: { usedBytes: userUsed, limitBytes: perUser, remainingBytes: Math.max(perUser - userUsed, 0) },
      organisation: {
        usedBytes: orgUsed,
        limitBytes: memberCount * perUser,
        remainingBytes: Math.max(memberCount * perUser - orgUsed, 0),
        memberCount,
      },
    };
  }

  async list(ctx: OrganisationContextValue, folderId?: string): Promise<FileRecordResult[]> {
    const actorId = ctx.actorId;
    if (!actorId) throw new ForbiddenException('Missing actor');
    // Only list files that are not bound to a restricted resource, or that the
    // actor uploaded. Resource-bound files (e.g. private-channel attachments)
    // are reachable through their owning resource, not the global listing.
    const records = await this.prisma.fileRecord.findMany({
      where: {
        organisationId: ctx.organisationId,
        ...(folderId !== undefined ? { folderId } : {}),
        OR: [{ resourceType: null }, { resourceType: { notIn: Object.keys(RESOURCE_ACCESS_CHECKS) } }, { uploaderId: actorId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.withSignedUrl(r));
  }

  async createFolder(ctx: OrganisationContextValue, dto: CreateFolderDto) {
    return this.prisma.folder.create({
      data: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        name: dto.name,
        category: dto.category,
        parentId: dto.parentId ?? null,
      },
    });
  }

  async listFolders(ctx: OrganisationContextValue, category?: string) {
    return this.prisma.folder.findMany({
      where: {
        organisationId: ctx.organisationId,
        ...(category ? { category } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(ctx: OrganisationContextValue, id: string): Promise<FileRecordResult> {
    const record = await this.accessibleRecord(ctx, id);
    const signedUrl = await this.storage.getSignedDownloadUrl(record.storageKey);
    return { ...this.withSignedUrl(record), downloadUrl: signedUrl };
  }

  async listVersions(ctx: OrganisationContextValue, id: string): Promise<FileRecordResult[]> {
    const record = await this.accessibleRecord(ctx, id);
    const groupId = record.versionGroupId ?? record.id;
    const records = await this.prisma.fileRecord.findMany({
      where: { organisationId: ctx.organisationId, versionGroupId: groupId },
      orderBy: { version: 'desc' },
    });
    return Promise.all(records.map(async (r) => ({ ...this.withSignedUrl(r), downloadUrl: await this.storage.getSignedDownloadUrl(r.storageKey) })));
  }

  async presignUpload(
    ctx: OrganisationContextValue,
    dto: PresignUploadDto,
    user?: AuthorizableUser,
  ): Promise<PresignUploadResult> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    if (typeof dto.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(dto.sha256)) {
      throw new BadRequestException('sha256 is required and must be a hex-encoded SHA-256 digest');
    }

    // A declared resource binding is verified up front so an upload URL is
    // never issued for a resource the actor cannot access.
    if (dto.resourceType || dto.resourceId) {
      if (!dto.resourceType || !dto.resourceId) {
        throw new BadRequestException('resourceType and resourceId must be provided together');
      }
      await this.assertResourceAccess(ctx, dto.resourceType, dto.resourceId);
    }

    const categoryPermission = this.categoryPermission(dto.category);
    if (categoryPermission && (!user || !hasPermission(user, categoryPermission))) {
      throw new ForbiddenException(`Missing permission to upload ${dto.category} files`);
    }

    if (dto.folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: { id: dto.folderId, organisationId: ctx.organisationId },
      });
      if (!folder) throw new NotFoundException('Folder not found');
    }

    await this.assertQuota(ctx, dto.size);

    const checksumSha256 = dto.sha256.toLowerCase();
    const checksumBase64 = Buffer.from(checksumSha256, 'hex').toString('base64');

    const id = randomUUID();
    const storageKey = this.storage.buildStorageKey({
      organisationId: ctx.organisationId,
      uploaderId: actorId,
      mimeType: dto.mimeType,
      fileName: dto.fileName,
    });

    const { url: uploadUrl, headers: uploadHeaders } = await this.storage.getSignedUploadUrl(
      storageKey,
      dto.mimeType,
      300,
      { checksumSha256Base64: checksumBase64 },
    );

    await this.prisma.fileRecord.create({
      data: {
        id,
        organisationId: ctx.organisationId,
        workspaceId: dto.workspaceId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        category: dto.category,
        folderId: dto.folderId,
        uploaderId: actorId,
        originalName: dto.fileName,
        mimeType: dto.mimeType,
        size: dto.size,
        bucket: this.storage.getBucket(),
        storageKey,
        checksumSha256,
        status: 'pending',
      },
    });

    return { id, uploadUrl, storageKey, uploadHeaders };
  }

  async completeUpload(
    ctx: OrganisationContextValue,
    id: string,
    dto: CompleteUploadDto = {},
  ): Promise<FileRecordResult> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    if (dto.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(dto.sha256)) {
      throw new BadRequestException('sha256 must be a lowercase hex-encoded SHA-256 digest');
    }

    const existing = await this.prisma.fileRecord.findFirst({
      where: { id, organisationId: ctx.organisationId, uploaderId: actorId },
    });
    if (!existing) {
      throw new NotFoundException('File not found');
    }

    // Always verify against the checksum recorded at presign; a client-supplied
    // sha256 on complete must never widen or bypass the recorded expectation.
    const expectedSha256 = existing.checksumSha256?.toLowerCase() ?? null;
    if (!expectedSha256) {
      throw new BadRequestException('No checksum was recorded at presign for this upload');
    }
    if (dto.sha256 && dto.sha256.toLowerCase() !== expectedSha256) {
      await this.rejectCorruptUpload(existing.id, existing.storageKey, 'checksum mismatch');
    }

    const head = await this.storage.headObject(existing.storageKey);
    if (!head) {
      throw new NotFoundException('Object not found in storage');
    }
    if (head.contentLength !== undefined && head.contentLength !== existing.size) {
      await this.rejectCorruptUpload(existing.id, existing.storageKey, `size mismatch: expected ${existing.size}, got ${head.contentLength}`);
    }

    {
      // S3 returns the stored SHA-256 (base64) when the PUT carried a checksum;
      // otherwise fall back to hashing the object ourselves.
      const storedBase64 = head.checksumSha256;
      if (storedBase64) {
        if (Buffer.from(expectedSha256, 'hex').toString('base64') !== storedBase64) {
          await this.rejectCorruptUpload(existing.id, existing.storageKey, 'checksum mismatch');
        }
      } else {
        const actual = await this.hashObject(existing.storageKey);
        if (actual !== expectedSha256) {
          await this.rejectCorruptUpload(existing.id, existing.storageKey, 'checksum mismatch');
        }
      }
    }

    const publicUrl = this.storage.getPublicUrl(existing.storageKey);

    let version = 1;
    let versionGroupId: string | null = null;
    let baseRecord = existing;
    if (dto.versionOf) {
      const previous = await this.prisma.fileRecord.findFirst({
        where: { id: dto.versionOf, organisationId: ctx.organisationId },
      });
      if (!previous) throw new NotFoundException('Previous file version not found');
      await this.assertResourceAccess(ctx, previous.resourceType, previous.resourceId, previous.uploaderId);
      versionGroupId = previous.versionGroupId ?? previous.id;
      const maxVersion = await this.prisma.fileRecord.aggregate({
        where: { versionGroupId, organisationId: ctx.organisationId },
        _max: { version: true },
      });
      version = (maxVersion._max.version ?? 1) + 1;
      baseRecord = previous;
    }

    const payload = {
      id,
      organisationId: ctx.organisationId,
      workspaceId: baseRecord.workspaceId,
      resourceType: baseRecord.resourceType,
      resourceId: baseRecord.resourceId,
      category: baseRecord.category,
      uploaderId: actorId,
      originalName: existing.originalName,
      mimeType: existing.mimeType,
      size: existing.size,
      storageKey: existing.storageKey,
      bucket: this.storage.getBucket(),
      checksumSha256: expectedSha256,
      url: publicUrl,
      status: 'uploaded',
      version,
      versionGroupId,
      versionOf: dto.versionOf ?? null,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.FILE_UPLOADED,
      organisationId: ctx.organisationId,
      actorId,
      workspaceId: baseRecord.workspaceId ?? undefined,
      resourceType: 'file',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.fileRecord.update({
        where: { id },
        data: {
          status: 'uploaded',
          url: publicUrl,
          checksumSha256: expectedSha256,
          version,
          versionGroupId,
          workspaceId: baseRecord.workspaceId,
          resourceType: baseRecord.resourceType,
          resourceId: baseRecord.resourceId,
          category: baseRecord.category,
        },
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

  private async hashObject(storageKey: string): Promise<string> {
    const { stream } = await this.storage.getObjectStream(storageKey);
    const hash = createHash('sha256');
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }

  private async rejectCorruptUpload(fileId: string, storageKey: string, reason: string): Promise<never> {
    this.logger.warn({ fileId, storageKey, reason }, 'Upload integrity check failed');
    await this.prisma.fileRecord.update({ where: { id: fileId }, data: { status: 'failed' } });
    try {
      await this.storage.delete(storageKey);
    } catch (err) {
      this.logger.error({ fileId, error: (err as Error).message }, 'Failed to delete corrupt object');
    }
    throw new BadRequestException(`Upload integrity check failed: ${reason}`);
  }

  async upload(ctx: OrganisationContextValue, file: MulterFile): Promise<FileRecordResult> {
    const actorId = ctx.actorId;
    if (!actorId) {
      throw new ForbiddenException('Missing actor');
    }

    await this.assertQuota(ctx, file.size);

    const id = randomUUID();
    const category = 'attachment';
    const storageKey = this.storage.buildStorageKey({
      organisationId: ctx.organisationId,
      uploaderId: actorId,
      mimeType: file.mimetype,
      fileName: file.originalname,
    });

    const { etag } = await this.storage.uploadBuffer(storageKey, file.buffer, file.mimetype);
    const publicUrl = this.storage.getPublicUrl(storageKey);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

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
      checksumSha256,
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
          checksumSha256,
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

    const record = await this.accessibleRecord(ctx, id, { previews: true });

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
    await this.accessibleRecord(ctx, fileId);
    return this.prisma.externalShare.findMany({ where: { fileId, organisationId: ctx.organisationId }, orderBy: { createdAt: 'desc' } });
  }

  async createExternalShare(ctx: OrganisationContextValue, fileId: string, dto: CreateExternalShareDto) {
    const actorId = ctx.actorId;
    if (!actorId) throw new ForbiddenException('Missing actor');
    await this.accessibleRecord(ctx, fileId);
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
    const record = await this.accessibleRecord(ctx, id);
    return this.storage.getSignedDownloadUrl(record.storageKey);
  }

  async getFileStream(ctx: OrganisationContextValue, id: string) {
    const record = await this.accessibleRecord(ctx, id);
    const object = await this.storage.getObjectStream(record.storageKey);
    return { ...record, ...object };
  }

  async getPreviewStream(ctx: OrganisationContextValue, id: string, type: 'thumbnail' | 'preview') {
    const record = await this.accessibleRecord(ctx, id, {
      previews: { where: { previewType: type === 'preview' ? 'image_preview' : 'thumbnail' } },
    });
    const preview = record.previews[0];
    if (!preview) {
      throw new NotFoundException('Preview not found');
    }
    const object = await this.storage.getObjectStream(preview.storageKey);
    return { name: `${type}-${record.originalName}`, mimeType: record.mimeType, ...object };
  }
}
