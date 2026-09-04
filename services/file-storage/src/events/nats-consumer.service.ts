import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AckPolicy, type JsMsg, type JetStreamSubscription } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@teamspace-one/event-contracts';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsConsumerService.name);
  private subscription: JetStreamSubscription | undefined;
  private running = true;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();
    this.subscription = await js.subscribe('teamspace-one.file.>', {
      config: {
        durable_name: 'file-storage-consumer',
        deliver_subject: 'file-storage-consumer',
        ack_policy: AckPolicy.Explicit,
        deliver_policy: 'all' as any,
      },
    });

    this.consume(this.subscription).catch((err) => {
      this.logger.error(`NATS consumer error: ${(err as Error).message}`);
    });
  }

  async onModuleDestroy() {
    this.running = false;
    await this.subscription?.unsubscribe?.();
    this.logger.log('NATS consumer unsubscribed');
  }

  private async consume(subscription: JetStreamSubscription) {
    for await (const msg of subscription) {
      if (!this.running) break;
      const jsMsg = msg as JsMsg;
      try {
        const raw = new TextDecoder().decode(jsMsg.data);
        const data = JSON.parse(raw) as EventEnvelope;
        if (!isEventEnvelope(data)) {
          this.logger.warn('Received invalid event envelope');
          jsMsg.ack();
          continue;
        }
        await this.inbox.handle(data);
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Event processing failed: ${(err as Error).message}`);
        jsMsg.nak(5000);
      }
    }
  }
}
