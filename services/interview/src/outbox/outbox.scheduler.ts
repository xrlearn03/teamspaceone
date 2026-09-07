import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';

@Injectable()
export class OutboxScheduler implements OnModuleInit {
  private readonly logger = new Logger(OutboxScheduler.name);

  constructor(@InjectQueue('outbox') private readonly outboxQueue: Queue) {}

  async onModuleInit() {
    this.logger.log('Starting outbox scheduler');
    await this.outboxQueue.add(
      'publish',
      {},
      {
        repeat: {
          every: 5000,
          key: 'outbox-publish-every-5s',
        },
        jobId: 'outbox-publish-recurring',
      },
    );
  }
}
