import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AckPolicy, type JsMsg } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@reactify/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NatsClientService } from './nats-client.service.js';
import { DeadLetterService } from './dead-letter.service.js';

@Injectable()
export class NatsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(NatsConsumerService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly audit: AuditService,
    private readonly deadLetter: DeadLetterService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();
    const subscription = await js.subscribe('reactify.>', {
      config: {
        durable_name: 'audit-consumer',
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
        const data = JSON.parse(raw);

        if (this.deadLetter.isDeadLetterSubject(jsMsg.subject)) {
          await this.deadLetter.store(jsMsg.subject, data as any);
          jsMsg.ack();
          continue;
        }

        if (!isEventEnvelope(data)) {
          this.logger.warn('Received invalid event envelope');
          jsMsg.ack();
          continue;
        }

        await this.inbox.handle(data, (tx, envelope) => this.audit.store(tx, envelope));
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Event processing failed: ${(err as Error).message}`);
        jsMsg.nak(5000);
      }
    }
  }
}
