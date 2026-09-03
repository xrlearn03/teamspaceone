import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { StorageService } from '../storage/storage.service.js';

export interface ProcessFileJob {
  fileId: string;
  organisationId: string;
  actorId?: string;
  correlationId?: string;
}

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    @InjectQueue('file-processing') private readonly fileProcessingQueue: Queue,
  ) {}

  async enqueue(job: ProcessFileJob): Promise<void> {
    await this.fileProcessingQueue.add('process', job, { jobId: `process-${job.fileId}` });
    this.logger.log({ fileId: job.fileId }, 'Enqueued file processing job');
  }

  async process(job: ProcessFileJob): Promise<void> {
    const record = await this.prisma.fileRecord.findFirst({
      where: { id: job.fileId, organisationId: job.organisationId },
    });
    if (!record) {
      this.logger.warn({ fileId: job.fileId }, 'File not found for processing');
      return;
    }

    if (record.status !== 'uploaded' && record.status !== 'pending') {
      this.logger.log({ fileId: job.fileId, status: record.status }, 'File already processed');
      return;
    }

    const metadata: Record<string, unknown> = {};
    let previewUrl: string | null = record.url;
    let thumbnailUrl: string | null = null;

    try {
      const downloadUrl = await this.storage.getSignedDownloadUrl(record.storageKey, 60);

      if (record.mimeType.startsWith('image/')) {
        const result = await this.processImage(record, downloadUrl);
        thumbnailUrl = result.thumbnailUrl ?? null;
        previewUrl = result.previewUrl ?? previewUrl;
        metadata.width = result.width;
        metadata.height = result.height;
      } else if (record.mimeType === 'text/plain' || record.mimeType === 'text/markdown') {
        const text = await this.fetchText(downloadUrl);
        metadata.textPreview = text.slice(0, 2000);
      }

      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.fileRecord.update({
          where: { id: job.fileId },
          data: {
            status: 'processed',
            previewUrl,
            thumbnailUrl,
            metadata: metadata as Prisma.InputJsonValue,
          },
        });

        if (thumbnailUrl) {
          await tx.filePreview.create({
            data: {
              fileId: record.id,
              previewType: 'thumbnail',
              organisationId: record.organisationId,
              storageKey: this.buildPreviewKey(record.storageKey, 'thumbnail'),
              url: thumbnailUrl,
              metadata: { width: metadata.width, height: metadata.height } as Prisma.InputJsonValue,
            },
          });
        }

        if (previewUrl && previewUrl !== record.url) {
          await tx.filePreview.create({
            data: {
              fileId: record.id,
              previewType: 'image_preview',
              organisationId: record.organisationId,
              storageKey: this.buildPreviewKey(record.storageKey, 'preview'),
              url: previewUrl,
              metadata: { width: metadata.width, height: metadata.height } as Prisma.InputJsonValue,
            },
          });
        }

        const envelope = createEventEnvelope({
          eventType: Subjects.FILE_PROCESSED,
          organisationId: record.organisationId,
          actorId: job.actorId,
          resourceType: 'file',
          resourceId: record.id,
          correlationId: job.correlationId,
          payload: {
            id: record.id,
            organisationId: record.organisationId,
            status: 'processed',
            previewUrl,
            thumbnailUrl,
            metadata,
          },
        });

        await this.outbox.createEvent(tx, envelope, Subjects.FILE_PROCESSED);

        return updated;
      });

      this.logger.log({ fileId: job.fileId }, 'File processed successfully');
    } catch (err) {
      this.logger.error({ fileId: job.fileId, error: (err as Error).message }, 'File processing failed');
      await this.prisma.fileRecord.update({
        where: { id: job.fileId },
        data: { status: 'failed' },
      });
      throw err;
    }
  }

  private buildPreviewKey(storageKey: string, type: string): string {
    const parts = storageKey.split('/');
    const fileName = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join('/');
    return `${prefix}/previews/${type}-${fileName}`;
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
  }

  private async processImage(
    record: { storageKey: string; organisationId: string; mimeType: string },
    downloadUrl: string,
  ): Promise<{ thumbnailUrl?: string; previewUrl?: string; width?: number; height?: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sharp: any;
    try {
      const mod = await import('sharp');
      sharp = mod.default || mod;
    } catch {
      this.logger.warn('sharp not available, skipping image resize');
      return {};
    }

    const response = await fetch(downloadUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const image = sharp(buffer);
    const imageMetadata = await image.metadata();
    const width = imageMetadata.width as number | undefined;
    const height = imageMetadata.height as number | undefined;

    const thumbnailBuffer = await image.resize(256, 256, { fit: 'inside', withoutEnlargement: true }).toBuffer();
    const thumbnailKey = this.buildPreviewKey(record.storageKey, 'thumbnail');
    await this.storage.uploadBuffer(thumbnailKey, thumbnailBuffer, record.mimeType);
    const thumbnailUrl = this.storage.getPublicUrl(thumbnailKey);

    let previewUrl: string | undefined;
    if ((width && width > 1024) || (height && height > 1024)) {
      const previewBuffer = await sharp(buffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      const previewKey = this.buildPreviewKey(record.storageKey, 'preview');
      await this.storage.uploadBuffer(previewKey, previewBuffer, record.mimeType);
      previewUrl = this.storage.getPublicUrl(previewKey);
    }

    return { thumbnailUrl, previewUrl, width, height };
  }
}
