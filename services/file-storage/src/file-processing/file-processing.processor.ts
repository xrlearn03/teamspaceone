import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { FileProcessingService, type ProcessFileJob } from './file-processing.service.js';

@Processor('file-processing')
export class FileProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessingProcessor.name);

  constructor(private readonly processing: FileProcessingService) {
    super();
  }

  async process(job: Job<ProcessFileJob>): Promise<void> {
    this.logger.log({ fileId: job.data.fileId, jobId: job.id }, 'Processing file');
    await this.processing.process(job.data);
  }
}
