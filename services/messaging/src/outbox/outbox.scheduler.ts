import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';

@Injectable()
export class OutboxScheduler implements OnModuleInit {
  private readonly logger = new Logger(OutboxScheduler.name);

  constructor(@InjectQueue('outbox') private readonly outboxQueue: Queue) {}

  onModuleInit() {
    this.logger.log('Starting outbox scheduler');
    setInterval(() => {
      this.outboxQueue.add('publish', {}).catch((err: Error) => {
        this.logger.error(`Failed to schedule outbox publish: ${err.message}`);
      });
    }, 5000);
  }
}
