import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
} from 'nats';

@Injectable()
export class NatsClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsClientService.name);
  private nc: NatsConnection | undefined;
  private js: JetStreamClient | undefined;
  private manager: JetStreamManager | undefined;
  private connectingPromise: Promise<NatsConnection> | undefined;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('NATS_URL', 'nats://localhost:4222');
    this.logger.log(`Connecting to NATS at ${url}`);
    this.connectingPromise = connect({ servers: url });
    this.nc = await this.connectingPromise;
    this.js = this.nc.jetstream();
    this.manager = await this.nc.jetstreamManager();
    this.logger.log('Connected to NATS JetStream');
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

  async getManager(): Promise<JetStreamManager> {
    await this.getConnection();
    if (!this.manager) {
      this.manager = await this.nc!.jetstreamManager();
    }
    return this.manager;
  }
}
