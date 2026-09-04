import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AckPolicy, DeliverPolicy, type JsMsg, type JetStreamSubscription } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@teamspace-one/event-contracts';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';

const MAX_DELIVER = 5;
const ACK_WAIT_NANOS = 30_000_000_000;
const BACKOFF_NANOS = [
  1_000_000_000,
  5_000_000_000,
  15_000_000_000,
  30_000_000_000,
  60_000_000_000,
];

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsConsumerService.name);
  private subscription: JetStreamSubscription | undefined;
  private stopped = false;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    this.subscription = await js.subscribe('teamspace-one.template.>', {
      config: {
        durable_name: 'template-consumer',
        deliver_subject: 'template-consumer',
        deliver_group: 'template-consumers',
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        max_ack_pending: 100,
        max_deliver: MAX_DELIVER,
        ack_wait: ACK_WAIT_NANOS,
        backoff: BACKOFF_NANOS,
      },
    });

    this.consume().catch((err) => {
      this.logger.error(`NATS consumer error: ${(err as Error).message}`);
    });
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.subscription) {
      try {
        await this.subscription.drain();
      } catch (err) {
        this.logger.error(`Error draining NATS subscription: ${(err as Error).message}`);
      }
    }
  }

  private async consume() {
    if (!this.subscription) return;

    for await (const msg of this.subscription) {
      if (this.stopped) break;

      const jsMsg = msg as JsMsg;
      try {
        const raw = new TextDecoder().decode(jsMsg.data);
        const data = JSON.parse(raw) as EventEnvelope;

        if (!isEventEnvelope(data)) {
          this.logger.warn({ subject: jsMsg.subject }, 'Received invalid event envelope');
          jsMsg.ack();
          continue;
        }

        if (jsMsg.info.deliveryCount >= MAX_DELIVER) {
          await this.sendToDeadLetter(jsMsg, data, 'Max delivery attempts exceeded');
          jsMsg.ack();
          continue;
        }

        await this.inbox.handle(data, jsMsg.subject);
        jsMsg.ack();
      } catch (err) {
        this.logger.error(
          { eventId: (msg as JsMsg).info?.streamSequence, error: (err as Error).message },
          'Event processing failed',
        );
        jsMsg.nak();
      }
    }
  }

  private async sendToDeadLetter(jsMsg: JsMsg, envelope: EventEnvelope, reason: string) {
    const dlqSubject = `teamspace-one.dead-letter.${envelope.eventType}`;
    const js = await this.natsClient.getJetStream();

    try {
      await js.publish(
        dlqSubject,
        JSON.stringify({
          envelope,
          subject: jsMsg.subject,
          deliveryCount: jsMsg.info.deliveryCount,
          reason,
          occurredAt: new Date().toISOString(),
        }),
      );
      this.logger.warn(
        { eventId: envelope.eventId, subject: jsMsg.subject, reason },
        'Moved event to dead-letter queue',
      );
    } catch (err) {
      this.logger.error(
        { eventId: envelope.eventId, error: (err as Error).message },
        'Failed to publish dead-letter event',
      );
    }
  }
}
