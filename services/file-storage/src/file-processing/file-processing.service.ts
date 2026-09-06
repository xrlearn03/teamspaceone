import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { type Queue } from 'bullmq';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createEventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { StorageService } from '../storage/storage.service.js';

const execFileAsync = promisify(execFile);

export interface ProcessFileJob {
  fileId: string;
  organisationId: string;
  actorId?: string;
  correlationId?: string;
}

export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'text' | 'other';

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf',
  'text/rtf',
  'text/csv',
  'text/html',
  'text/markdown',
  'application/epub+zip',
]);

const ARCHIVE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-bzip2',
]);

const ZIP_MIME_TYPES = new Set(['application/zip', 'application/x-zip-compressed', 'application/epub+zip']);

const MAX_TEXT_PREVIEW_CHARS = 8000;
const MAX_ARCHIVE_LIST_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 200;
const MAX_DOC_EXTRACT_BYTES = 100 * 1024 * 1024;
const HLS_MAX_DURATION_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_TEXT_FETCH_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_FETCH_BYTES = 100 * 1024 * 1024;

/** fetch() with a hard timeout; aborts via AbortController. */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a response body into a Buffer, aborting as soon as `maxBytes` is
 * exceeded rather than trusting Content-Length alone.
 */
async function bufferResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error('Response has no body');
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = (response.body as unknown as AsyncIterable<Uint8Array>);
  for await (const chunk of reader) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new Error(`Object exceeds in-memory processing cap of ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);

  private ffmpegAvailable: boolean | null = null;
  private readonly hlsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @InjectQueue('file-processing') private readonly fileProcessingQueue: Queue,
  ) {
    this.hlsEnabled = this.config.get<string>('FILE_HLS_ENABLED') === 'true';
  }

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

    const kind = this.classify(record.mimeType, record.originalName);
    const metadata: Record<string, unknown> = { kind };
    const extraPreviews: { previewType: string; storageKey: string; url: string | null; metadata?: Prisma.InputJsonValue }[] = [];
    let previewUrl: string | null = record.url;
    let thumbnailUrl: string | null = null;

    try {
      const downloadUrl = await this.storage.getSignedDownloadUrl(record.storageKey, 600);

      switch (kind) {
        case 'image': {
          const result = await this.processImage(record, downloadUrl);
          thumbnailUrl = result.thumbnailUrl ?? null;
          previewUrl = result.previewUrl ?? previewUrl;
          metadata.width = result.width;
          metadata.height = result.height;
          break;
        }
        case 'text': {
          const text = await this.fetchText(downloadUrl, Math.min(record.size || MAX_TEXT_FETCH_BYTES, MAX_TEXT_FETCH_BYTES));
          metadata.textPreview = text.slice(0, MAX_TEXT_PREVIEW_CHARS);
          break;
        }
        case 'video': {
          const result = await this.processVideo(record, downloadUrl);
          Object.assign(metadata, result.metadata);
          thumbnailUrl = result.thumbnailUrl ?? null;
          if (result.hls) {
            extraPreviews.push(result.hls);
            metadata.hlsManifest = result.hls.storageKey;
          }
          break;
        }
        case 'audio': {
          const probe = await this.probeMedia(downloadUrl);
          if (probe) Object.assign(metadata, probe);
          break;
        }
        case 'document': {
          const result = await this.extractDocumentText(record, downloadUrl);
          Object.assign(metadata, result.metadata);
          if (result.textExtract) extraPreviews.push(result.textExtract);
          break;
        }
        case 'archive': {
          const result = await this.listArchive(record, downloadUrl);
          Object.assign(metadata, result);
          break;
        }
        default:
          break;
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

        for (const extra of extraPreviews) {
          await tx.filePreview.create({
            data: {
              fileId: record.id,
              previewType: extra.previewType,
              organisationId: record.organisationId,
              storageKey: extra.storageKey,
              url: extra.url,
              metadata: extra.metadata,
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
            workspaceId: record.workspaceId,
            resourceType: record.resourceType,
            resourceId: record.resourceId,
            category: record.category,
            uploaderId: record.uploaderId,
            originalName: record.originalName,
            mimeType: record.mimeType,
            size: record.size,
            storageKey: record.storageKey,
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
      // The record is now marked 'failed'; rethrowing would only trigger a
      // meaningless BullMQ retry that immediately marks it failed again.
      return;
    }
  }

  private buildPreviewKey(storageKey: string, type: string): string {
    const parts = storageKey.split('/');
    const fileName = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join('/');
    return `${prefix}/previews/${type}-${fileName}`;
  }

  private async fetchText(url: string, maxBytes = MAX_TEXT_FETCH_BYTES): Promise<string> {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch text: HTTP ${response.status}`);
    }
    const buffer = await bufferResponse(response, maxBytes);
    return buffer.toString('utf8');
  }

  private async processImage(
    record: { storageKey: string; organisationId: string; mimeType: string; size: number },
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

    const maxBytes = Math.min(record.size > 0 ? record.size : MAX_IMAGE_FETCH_BYTES, MAX_IMAGE_FETCH_BYTES);
    const response = await fetchWithTimeout(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }
    const buffer = await bufferResponse(response, maxBytes);
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

  private classify(mimeType: string, originalName: string): FileKind {
    const name = originalName.toLowerCase();
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'text/plain') return 'text';
    if (DOCUMENT_MIME_TYPES.has(mimeType)) return 'document';
    if (ARCHIVE_MIME_TYPES.has(mimeType) || /\.(zip|tar|tar\.gz|tgz|gz|7z|rar|bz2)$/.test(name)) return 'archive';
    if (mimeType.startsWith('text/')) return 'text';
    return 'other';
  }

  private async downloadBuffer(url: string, maxBytes?: number): Promise<Buffer> {
    const response = await fetchWithTimeout(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download object: HTTP ${response.status}`);
    }
    if (maxBytes !== undefined) {
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > maxBytes) throw new Error(`Object too large for in-memory processing (${length} bytes)`);
      return bufferResponse(response, maxBytes);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async ensureFfmpeg(): Promise<boolean> {
    if (this.ffmpegAvailable !== null) return this.ffmpegAvailable;
    try {
      await execFileAsync('ffmpeg', ['-version']);
      await execFileAsync('ffprobe', ['-version']);
      this.ffmpegAvailable = true;
    } catch {
      this.ffmpegAvailable = false;
      this.logger.warn('ffmpeg/ffprobe not available, skipping media processing');
    }
    return this.ffmpegAvailable;
  }

  private async probeMedia(url: string): Promise<Record<string, unknown> | null> {
    if (!(await this.ensureFfmpeg())) return null;
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', url],
        { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
      );
      const probe = JSON.parse(stdout) as {
        format?: { duration?: string; bit_rate?: string };
        streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string; bit_rate?: string }[];
      };
      const video = probe.streams?.find((s) => s.codec_type === 'video');
      const audio = probe.streams?.find((s) => s.codec_type === 'audio');
      const duration = Number(probe.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
      const bitrate = Number(probe.format?.bit_rate ?? 0);
      const result: Record<string, unknown> = {};
      if (Number.isFinite(duration) && duration > 0) result.durationSeconds = Math.round(duration * 100) / 100;
      if (Number.isFinite(bitrate) && bitrate > 0) result.bitrate = bitrate;
      if (video) {
        result.width = video.width;
        result.height = video.height;
        result.videoCodec = video.codec_name;
      }
      if (audio) result.audioCodec = audio.codec_name;
      return result;
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'ffprobe failed');
      return null;
    }
  }

  private async processVideo(
    record: { storageKey: string; organisationId: string; mimeType: string; originalName: string },
    downloadUrl: string,
  ): Promise<{
    metadata: Record<string, unknown>;
    thumbnailUrl?: string;
    hls?: { previewType: string; storageKey: string; url: string | null; metadata?: Prisma.InputJsonValue };
  }> {
    const metadata = (await this.probeMedia(downloadUrl)) ?? {};
    if (this.ffmpegAvailable === false) return { metadata };

    const workDir = await mkdtemp(join(tmpdir(), 'fileproc-'));
    try {
      const thumbPath = join(workDir, 'thumbnail.jpg');
      const seekSeconds = typeof metadata.durationSeconds === 'number' ? Math.min(metadata.durationSeconds / 10, 5) : 1;
      await execFileAsync(
        'ffmpeg',
        [
          '-y', '-ss', seekSeconds.toFixed(2), '-i', downloadUrl,
          '-frames:v', '1', '-vf', "scale='min(512,iw)':-2", '-q:v', '4', thumbPath,
        ],
        { timeout: 120_000 },
      );

      let thumbnailUrl: string | undefined;
      try {
        const thumbnailBuffer = await readFile(thumbPath);
        const thumbnailKey = this.buildPreviewKey(record.storageKey, 'thumbnail');
        await this.storage.uploadBuffer(thumbnailKey, thumbnailBuffer, 'image/jpeg');
        thumbnailUrl = this.storage.getPublicUrl(thumbnailKey);
      } catch (err) {
        this.logger.warn({ error: (err as Error).message }, 'Video thumbnail upload failed');
      }

      let hls: { previewType: string; storageKey: string; url: string | null; metadata?: Prisma.InputJsonValue } | undefined;
      const duration = typeof metadata.durationSeconds === 'number' ? metadata.durationSeconds : 0;
      if (this.hlsEnabled && duration > 0 && duration <= HLS_MAX_DURATION_SECONDS) {
        hls = await this.generateHls(record, downloadUrl, workDir, duration);
      }

      return { metadata, thumbnailUrl, hls };
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Video processing failed');
      return { metadata };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async generateHls(
    record: { storageKey: string },
    downloadUrl: string,
    workDir: string,
    duration: number,
  ): Promise<{ previewType: string; storageKey: string; url: string | null; metadata?: Prisma.InputJsonValue } | undefined> {
    const hlsDir = join(workDir, 'hls');
    const manifestPath = join(hlsDir, 'index.m3u8');
    try {
      await mkdir(hlsDir, { recursive: true });
      await execFileAsync(
        'ffmpeg',
        [
          '-y', '-i', downloadUrl,
          '-map', '0:v:0', '-map', '0:a:0?',
          '-codec:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
          '-codec:a', 'aac', '-b:a', '96k',
          '-hls_time', '6', '-hls_playlist_type', 'vod',
          '-hls_segment_filename', join(hlsDir, 'seg%05d.ts'),
          manifestPath,
        ],
        { timeout: Math.max(120_000, duration * 4 * 1000), maxBuffer: 8 * 1024 * 1024 },
      );
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'HLS transcode failed');
      return undefined;
    }

    const manifestKey = this.buildPreviewKey(record.storageKey, 'hls') + '/index.m3u8';
    const hlsPrefix = manifestKey.slice(0, -'index.m3u8'.length);
    try {
      const entries = await readdir(hlsDir);
      for (const entry of entries) {
        const buffer = await readFile(join(hlsDir, entry));
        const contentType = entry.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
        await this.storage.uploadBuffer(hlsPrefix + entry, buffer, contentType);
      }
      return {
        previewType: 'hls_manifest',
        storageKey: manifestKey,
        url: this.storage.getPublicUrl(manifestKey) ?? null,
      };
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'HLS upload failed');
      return undefined;
    }
  }

  private async extractDocumentText(
    record: { storageKey: string; mimeType: string; size: number; originalName: string },
    downloadUrl: string,
  ): Promise<{
    metadata: Record<string, unknown>;
    textExtract?: { previewType: string; storageKey: string; url: string | null; metadata?: Prisma.InputJsonValue };
  }> {
    const metadata: Record<string, unknown> = {};
    if (record.size > MAX_DOC_EXTRACT_BYTES) {
      metadata.textExtracted = false;
      metadata.textExtractSkipped = 'too_large';
      return { metadata };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parseOffice: (input: Buffer, config?: Record<string, unknown>) => Promise<{ type?: string; toText: () => string }>;
    try {
      const mod = (await import('officeparser')) as any;
      parseOffice = mod.parseOffice ?? mod.default?.parseOffice;
      if (typeof parseOffice !== 'function') throw new Error('parseOffice not exported');
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'officeparser not available, skipping text extraction');
      return { metadata };
    }

    try {
      const buffer = await this.downloadBuffer(downloadUrl, MAX_DOC_EXTRACT_BYTES);
      const result = await parseOffice(buffer, { outputErrorToConsole: false, newlineDelimiter: '\n' });
      const raw = typeof result === 'string' ? result : typeof result?.toText === 'function' ? result.toText() : '';
      if (result && typeof result === 'object' && result.type) {
        metadata.documentType = result.type;
      }
      const cleaned = raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      metadata.textExtracted = cleaned.length > 0;
      metadata.extractedCharacters = cleaned.length;
      if (!cleaned) return { metadata };

      metadata.textPreview = cleaned.slice(0, MAX_TEXT_PREVIEW_CHARS);

      const textKey = this.buildPreviewKey(record.storageKey, 'text') + '.txt';
      await this.storage.uploadBuffer(textKey, Buffer.from(cleaned, 'utf8'), 'text/plain');
      return {
        metadata,
        textExtract: {
          previewType: 'text_extract',
          storageKey: textKey,
          url: this.storage.getPublicUrl(textKey) ?? null,
          metadata: { characters: cleaned.length } as Prisma.InputJsonValue,
        },
      };
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Document text extraction failed');
      metadata.textExtracted = false;
      return { metadata };
    }
  }

  private async listArchive(
    record: { storageKey: string; mimeType: string; size: number; originalName: string },
    downloadUrl: string,
  ): Promise<Record<string, unknown>> {
    const metadata: Record<string, unknown> = {};
    const isZip = ZIP_MIME_TYPES.has(record.mimeType) || /\.(zip|epub)$/.test(record.originalName.toLowerCase());
    if (!isZip || record.size > MAX_ARCHIVE_LIST_BYTES) {
      return metadata;
    }

    try {
      const { Open } = await import('unzipper');
      const buffer = await this.downloadBuffer(downloadUrl, MAX_ARCHIVE_LIST_BYTES);
      const directory = await Open.buffer(buffer);
      const entries = directory.files;
      const names = entries.filter((e) => e.type !== 'Directory').map((e) => e.path);
      metadata.archiveEntryCount = names.length;
      metadata.archiveEntries = names.slice(0, MAX_ARCHIVE_ENTRIES);
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Archive listing failed');
    }
    return metadata;
  }
}
