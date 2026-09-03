import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from './outbox.service.js';

@Processor('outbox')
export class OutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    this.logger.debug('Publishing pending outbox events');
    await this.outbox.publishPending(this.prisma);
  }
}
