import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, NatsError, nanos, RetentionPolicy, type NatsConnection, type JetStreamClient, type ConnectionOptions } from 'nats';
import { streamConfigs } from '@teamspace-one/event-contracts';

@Injectable()
export class NatsClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsClientService.name);
  private nc: NatsConnection | undefined;
  private js: JetStreamClient | undefined;
  private connectingPromise: Promise<NatsConnection> | undefined;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('NATS_URL', 'nats://localhost:4222');
    // The nats client cannot parse credentials embedded in the server URL;
    // pass them as dedicated options instead.
    const parsed = new URL(url);
    const servers = `${parsed.protocol}//${parsed.host}`;
    const options: ConnectionOptions = { servers };
    if (parsed.username) options.user = decodeURIComponent(parsed.username);
    if (parsed.password) options.pass = decodeURIComponent(parsed.password);
    this.logger.log(`Connecting to NATS at ${servers}`);
    this.connectingPromise = connect(options);
    this.nc = await this.connectingPromise;
    this.js = this.nc.jetstream();
    this.logger.log('Connected to NATS JetStream');
    await this.setupStreams();
  }

  async onModuleDestroy() {
    await this.nc?.close();
  }

  isConnected(): boolean {
    return this.nc !== undefined && !this.nc.isClosed();
  }

  async getConnection(): Promise<NatsConnection> {
    if (!this.nc) {
      if (!this.connectingPromise) {
        throw new Error('NATS connection not available');
      }
      await this.connectingPromise;
    }
    if (!this.nc) {
      throw new Error('NATS connection not available');
    }
    return this.nc;
  }

  async getJetStream(): Promise<JetStreamClient> {
    await this.getConnection();
    if (!this.js) {
      this.js = this.nc!.jetstream();
    }
    return this.js;
  }

  private async setupStreams() {
    const nc = await this.getConnection();
    const jsm = await nc.jetstreamManager();

    for (const config of streamConfigs) {
      try {
        await jsm.streams.add({
          name: config.name,
          subjects: config.subjects,
          retention: this.toRetentionPolicy(config.retention),
          max_msgs: config.maxMsgs,
          max_age: config.maxAge ? nanos(config.maxAge) : undefined,
          num_replicas: config.replicas ?? 1,
        });
        this.logger.log(`Created JetStream stream ${config.name}`);
      } catch (err) {
        if (err instanceof NatsError && err.message?.includes('already in use')) {
          try {
            await jsm.streams.update(config.name, { subjects: config.subjects });
            this.logger.log(`Updated JetStream stream ${config.name}`);
          } catch (updateErr) {
            this.logger.error(`Failed to update stream ${config.name}: ${(updateErr as Error).message}`);
          }
        } else {
          this.logger.error(`Failed to create stream ${config.name}: ${(err as Error).message}`);
        }
      }
    }
  }

  private toRetentionPolicy(retention: 'limits' | 'interest' | 'work'): RetentionPolicy {
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
