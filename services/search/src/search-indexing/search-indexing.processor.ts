import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { SearchIndexingService, type ReindexJob } from './search-indexing.service.js';

@Processor('search-indexing')
export class SearchIndexingProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexingProcessor.name);

  constructor(private readonly indexingService: SearchIndexingService) {
    super();
  }

  async process(job: Job<ReindexJob>): Promise<void> {
    this.logger.log({ jobId: job.id, resourceType: job.data.resourceType, resourceId: job.data.resourceId }, 'Processing reindex job');
    await this.indexingService.process(job.data);
  }
}
