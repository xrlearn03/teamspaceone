import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createEventEnvelope, Subjects } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';

@Injectable()
export class FileStorageService {
  private readonly storagePath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {
    this.storagePath = this.config.get<string>('STORAGE_PATH', './uploads');
  }

  async list(ctx: OrganisationContextValue) {
    return this.prisma.fileRecord.findMany({
      where: { organisationId: ctx.organisationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(ctx: OrganisationContextValue, file: any): Promise<any> {
    const id = randomUUID();
    const storageKey = `${ctx.organisationId}/${id}-${file.originalname}`;
    const target = path.join(this.storagePath, storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.buffer);

    const payload = {
      id,
      organisationId: ctx.organisationId,
      uploaderId: ctx.actorId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storageKey,
      url: target,
    };

    const envelope = createEventEnvelope({
      eventType: Subjects.FILE_UPLOADED,
      organisationId: ctx.organisationId,
      actorId: ctx.actorId,
      resourceType: 'file',
      resourceId: id,
      correlationId: ctx.correlationId,
      payload,
    });

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const record = await tx.fileRecord.create({
        data: {
          id,
          organisationId: ctx.organisationId,
          uploaderId: ctx.actorId!,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          storageKey,
          url: target,
        },
      });
      await this.outbox.createEvent(tx, envelope, Subjects.FILE_UPLOADED);
      return record;
    });
  }
}
