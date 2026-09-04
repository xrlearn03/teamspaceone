import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue, type Job } from 'bullmq';
import { createEventEnvelope, type EventEnvelope } from '@teamspace-one/event-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from '../search/search.service.js';

export interface ReindexJob {
  eventType: string;
  organisationId: string;
  workspaceId?: string;
  actorId?: string;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}

@Injectable()
export class SearchIndexingService {
  private readonly logger = new Logger(SearchIndexingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    @InjectQueue('search-indexing') private readonly indexingQueue: Queue,
  ) {}

  async enqueue(job: ReindexJob): Promise<Job<ReindexJob>> {
    const bullJob = await this.indexingQueue.add('reindex', job, {
      jobId: `reindex-${job.organisationId}-${job.resourceType}-${job.resourceId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    });
    this.logger.log({ jobId: bullJob.id, resourceType: job.resourceType, resourceId: job.resourceId }, 'Enqueued reindex job');
    return bullJob;
  }

  async process(job: ReindexJob): Promise<void> {
    const envelope = createEventEnvelope({
      eventType: job.eventType,
      organisationId: job.organisationId,
      workspaceId: job.workspaceId,
      actorId: job.actorId,
      resourceType: job.resourceType,
      resourceId: job.resourceId,
      correlationId: job.correlationId,
      payload: job.payload,
    });

    await this.prisma.$transaction(async (tx) => {
      await this.search.upsert(tx, envelope);
    });

    this.logger.log({ resourceType: job.resourceType, resourceId: job.resourceId }, 'Reindexed document');
  }
}
