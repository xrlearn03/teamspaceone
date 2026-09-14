import { Processor, WorkerHost } from '@nestjs/bullmq';
import { type Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AiService } from './ai.service.js';

@Processor('ai-ingestion')
export class AiIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(AiIngestionProcessor.name);

  constructor(private readonly ai: AiService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log({ jobId: job.id, name: job.name }, 'Processing AI ingestion job');

    switch (job.name) {
      case 'index':
        await this.ai.processIndexJob(job.data as { organisationId: string; resourceType: string; resourceId: string });
        break;
      case 'summarize':
        await this.ai.processSummarizeJob(
          job.data as { organisationId: string; resourceType: string; resourceId: string; wasRecording?: boolean },
          job.attemptsMade,
        );
        break;
      default:
        this.logger.warn({ jobId: job.id, name: job.name }, 'Unknown AI ingestion job type');
    }
  }
}
