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

interface ConsumerConfig {
  stream: string;
  subject: string;
  durable: string;
}

const CONSUMERS: ConsumerConfig[] = [
  { stream: 'INTERVIEW', subject: 'teamspace-one.interview.>', durable: 'interview-consumer' },
  { stream: 'MEETINGS', subject: 'teamspace-one.meeting.recording.transcript.ready', durable: 'interview-meeting-consumer' },
];

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsConsumerService.name);
  private subscriptions: JetStreamSubscription[] = [];
  private stopped = false;

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
            deliver_subject: consumer.durable,
            deliver_group: `${consumer.durable}-group`,
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            max_ack_pending: 100,
            max_deliver: MAX_DELIVER,
            ack_wait: ACK_WAIT_NANOS,
            backoff: BACKOFF_NANOS,
          },
        });
        this.subscriptions.push(subscription);
        this.consume(subscription).catch((err) => {
          this.logger.error(`NATS consumer error [${consumer.subject}]: ${(err as Error).message}`);
        });
      } catch (err) {
        this.logger.error(`Failed to subscribe to ${consumer.subject}: ${(err as Error).message}`);
      }
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    for (const subscription of this.subscriptions) {
      try {
        await subscription.drain();
      } catch (err) {
        this.logger.error(`Error draining NATS subscription: ${(err as Error).message}`);
      }
    }
  }

  private async consume(subscription: JetStreamSubscription) {
    for await (const msg of subscription) {
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
