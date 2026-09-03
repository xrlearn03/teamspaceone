import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AckPolicy, type JsMsg } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@reactify/event-contracts';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';

interface ConsumerConfig {
  stream: string;
  subject: string;
  durable: string;
}

const CONSUMERS: ConsumerConfig[] = [
  { stream: 'ORGANISATION', subject: 'reactify.organisation.>', durable: 'meeting-organisation-consumer' },
  { stream: 'ORGANISATION', subject: 'reactify.workspace.>', durable: 'meeting-workspace-consumer' },
  { stream: 'USERS', subject: 'reactify.user.>', durable: 'meeting-user-consumer' },
];

@Injectable()
export class NatsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(NatsConsumerService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    for (const consumer of CONSUMERS) {
      try {
        const subscription = await js.subscribe(consumer.subject, {
          stream: consumer.stream,
          config: {
            durable_name: consumer.durable,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: 'all' as any,
            max_deliver: 5,
            backoff: [1000, 5000, 10000],
          },
        });

        this.consume(subscription).catch((err) => {
          this.logger.error(`NATS consumer error [${consumer.subject}]: ${(err as Error).message}`);
        });
      } catch (err) {
        this.logger.error(`Failed to subscribe to ${consumer.subject}: ${(err as Error).message}`);
      }
    }
  }

  private async consume(subscription: any) {
    for await (const msg of subscription) {
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
