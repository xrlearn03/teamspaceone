import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, nanos, type JsMsg } from 'nats';
import { isEventEnvelope, Subjects, type EventEnvelope, Streams } from '@teamspace-one/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { NotificationService, type CreatedNotification } from '../notification/notification.service.js';
import { NatsClientService } from './nats-client.service.js';

interface ConsumerDefinition {
  stream: string;
  subject: string;
  durable: string;
}

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsConsumerService.name);
  private readonly subscriptions: any[] = [];
  private closed = false;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly notification: NotificationService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();
    const nc = await this.natsClient.getConnection();
    const jsm = await nc.jetstreamManager();

    const consumers: ConsumerDefinition[] = [
      { stream: Streams.MESSAGING, subject: 'teamspace-one.message.>', durable: 'notification-messaging-consumer' },
      { stream: Streams.PROJECTS, subject: 'teamspace-one.task.>', durable: 'notification-projects-consumer' },
      { stream: Streams.MEETINGS, subject: 'teamspace-one.meeting.>', durable: 'notification-meetings-consumer' },
      { stream: Streams.FILES, subject: 'teamspace-one.file.>', durable: 'notification-files-consumer' },
      { stream: Streams.AI, subject: Subjects.AI_SUMMARY_COMPLETED, durable: 'notification-ai-consumer' },
    ];

    for (const c of consumers) {
      try {
        await jsm.consumers.delete(c.stream, c.durable);
      } catch {
        // consumer may not exist
      }

      const subscription = await js.subscribe(c.subject, {
        stream: c.stream,
        mack: true,
        config: {
          durable_name: c.durable,
          deliver_subject: c.durable,
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
          max_deliver: 5,
          max_ack_pending: 100,
          ack_wait: nanos(30000),
          backoff: [nanos(1000), nanos(5000), nanos(10000), nanos(30000), nanos(60000)],
        },
      });

      this.subscriptions.push(subscription);
      this.consume(subscription, c).catch((err) => {
        this.logger.error(`NATS consumer error on ${c.subject}: ${(err as Error).message}`);
      });
    }
  }

  async onModuleDestroy() {
    this.closed = true;
    await Promise.all(
      this.subscriptions.map(async (s) => {
        try {
          await (s.drain ? s.drain() : s.unsubscribe?.());
        } catch (err) {
          this.logger.error(`Failed to drain subscription: ${(err as Error).message}`);
        }
      }),
    );
  }

  private async consume(subscription: any, def: ConsumerDefinition) {
    for await (const msg of subscription) {
      if (this.closed) break;

      const jsMsg = msg as JsMsg;
      try {
        const raw = new TextDecoder().decode(jsMsg.data);
        const data = JSON.parse(raw) as EventEnvelope;

        if (!isEventEnvelope(data)) {
          this.logger.warn({ stream: def.stream, subject: def.subject }, 'Received invalid event envelope');
          jsMsg.ack();
          continue;
        }

        if (data.eventType === Subjects.NOTIFICATION_CREATED) {
          jsMsg.ack();
          continue;
        }

        const result = await this.inbox.handle(data, (tx, envelope) =>
          this.notification.createFromEvent(tx, envelope),
        );

        const created = (result ?? []) as CreatedNotification[];
        for (const n of created) {
          if (n?.deliveryIds?.length) {
            await this.notification.enqueueDeliveries(n.deliveryIds);
          }
        }

        jsMsg.ack();
      } catch (err) {
        this.logger.error(
          {
            stream: def.stream,
            subject: def.subject,
            deliveryCount: jsMsg.info.deliveryCount,
            error: (err as Error).message,
          },
          'Event processing failed',
        );

        if (jsMsg.info.deliveryCount >= 5) {
          await this.publishDeadLetter(jsMsg, err as Error);
          jsMsg.term('Max delivery attempts exceeded');
        } else {
          jsMsg.nak();
        }
      }
    }
  }

  private async publishDeadLetter(jsMsg: JsMsg, err: Error) {
    try {
      const js = await this.natsClient.getJetStream();
      const raw = new TextDecoder().decode(jsMsg.data);
      const payload = {
        originalSubject: jsMsg.subject,
        original: JSON.parse(raw),
        error: err.message,
        deliveryCount: jsMsg.info.deliveryCount,
        occurredAt: new Date().toISOString(),
      };
      await js.publish('teamspace-one.notification.dead', JSON.stringify(payload));
    } catch (publishErr) {
      this.logger.error(
        { error: (publishErr as Error).message },
        'Failed to publish dead-letter event',
      );
    }
  }
}
