import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';

@Injectable()
export class OutboxScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxScheduler.name);
  private interval?: NodeJS.Timeout;

  constructor(@InjectQueue('outbox') private readonly outboxQueue: Queue) {}

  onModuleInit() {
    this.logger.log('Starting outbox scheduler');
    this.interval = setInterval(() => {
      this.outboxQueue.add('publish', {}).catch((err: Error) => {
        this.logger.error(`Failed to schedule outbox publish: ${err.message}`);
      });
    }, 5000);
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }
}
