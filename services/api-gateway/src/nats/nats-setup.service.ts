import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsError, RetentionPolicy } from 'nats';
import { streamConfigs, type StreamConfig } from '@reactify/event-contracts';
import { NatsClientService } from './nats-client.service.js';

@Injectable()
export class NatsSetupService implements OnModuleInit {
  private readonly logger = new Logger(NatsSetupService.name);

  constructor(private readonly natsClient: NatsClientService) {}

  async onModuleInit() {
    const nc = await this.natsClient.getConnection();
    const jsm = await nc.jetstreamManager();

    for (const config of streamConfigs) {
      try {
        await jsm.streams.add({
          name: config.name,
          subjects: config.subjects,
          retention: this.toRetentionPolicy(config.retention),
          max_msgs: config.maxMsgs,
          max_age: config.maxAge ? config.maxAge * 1_000_000_000 : undefined,
          num_replicas: config.replicas ?? 1,
        });
        this.logger.log(`Created JetStream stream ${config.name}`);
      } catch (err) {
        if (err instanceof NatsError && err.message?.includes('already in use')) {
          this.logger.log(`JetStream stream ${config.name} already exists`);
        } else {
          this.logger.error(`Failed to create stream ${config.name}: ${(err as Error).message}`);
        }
      }
    }
  }

  private toRetentionPolicy(retention: StreamConfig['retention']): RetentionPolicy {
    switch (retention) {
      case 'interest':
        return RetentionPolicy.Interest;
      case 'work':
        return RetentionPolicy.Workqueue;
      case 'limits':
      default:
        return RetentionPolicy.Limits;
    }
  }
}
