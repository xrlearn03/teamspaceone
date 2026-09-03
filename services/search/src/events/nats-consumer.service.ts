import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AckPolicy, type JsMsg } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@reactify/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { SearchService } from '../search/search.service.js';
import { NatsClientService } from './nats-client.service.js';

@Injectable()
export class NatsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(NatsConsumerService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly search: SearchService,
  ) {}

  async onModuleInit() {
    const js = this.natsClient.getJetStream();
    const subscription = await js.subscribe('reactify.>', {
      config: {
        durable_name: 'search-consumer',
        ack_policy: AckPolicy.Explicit,
        deliver_policy: 'all' as any,
      },
    });

    this.consume(subscription).catch((err) => {
      this.logger.error(`NATS consumer error: ${(err as Error).message}`);
    });
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
        await this.inbox.handle(data, (tx, envelope) =>
          this.search.upsert(tx, envelope),
        );
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Event processing failed: ${(err as Error).message}`);
        jsMsg.nak(5000);
      }
    }
  }
}
