import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, type JsMsg } from 'nats';
import { isEventEnvelope, streamConfigs, type EventEnvelope } from '@reactify/event-contracts';
import { withTraceContextHeaders } from '@reactify/opentelemetry';
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

    for (const stream of streamConfigs) {
      if (stream.subjects.length === 0) continue;
      const primary = stream.subjects[0];
      const durable = `audit-consumer-${stream.name.toLowerCase()}`;

      try {
        const subscription = await js.subscribe(primary, {
          config: {
            durable_name: durable,
            deliver_subject: durable,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            filter_subjects: stream.subjects,
          },
        });

        this.consume(subscription).catch((err) => {
          this.logger.error(`NATS consumer error for ${stream.name}: ${(err as Error).message}`);
        });
      } catch (err) {
        this.logger.error(`Failed to subscribe to ${stream.name}: ${(err as Error).message}`);
      }
    }
  }

  private async consume(subscription: any) {
    for await (const msg of subscription) {
      const jsMsg = msg as JsMsg;
      const traceparent = jsMsg.headers?.get('traceparent');
      const traceHeaders: Record<string, string> = traceparent ? { traceparent } : {};

      try {
        await withTraceContextHeaders(traceHeaders, async () => {
          const raw = new TextDecoder().decode(jsMsg.data);
          const data = JSON.parse(raw);

          if (this.deadLetter.isDeadLetterSubject(jsMsg.subject)) {
            await this.deadLetter.store(jsMsg.subject, data as any);
            jsMsg.ack();
            return;
          }

          if (!isEventEnvelope(data)) {
            this.logger.warn('Received invalid event envelope');
            jsMsg.ack();
            return;
          }

          await this.inbox.handle(data, (tx, envelope) => this.audit.store(tx, envelope));
          jsMsg.ack();
        });
      } catch (err) {
        this.logger.error(`Event processing failed: ${(err as Error).message}`);
        jsMsg.nak(5000);
      }
    }
  }
}
