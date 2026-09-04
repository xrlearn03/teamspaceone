import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, nanos, type JsMsg } from 'nats';
import { isEventEnvelope, Subjects, type EventEnvelope, Streams } from '@reactify/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
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
    private readonly realtime: RealtimeGateway,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    const consumers: ConsumerDefinition[] = [
      { stream: Streams.MESSAGING, subject: 'reactify.message.>', durable: 'realtime-message-consumer' },
      { stream: Streams.MESSAGING, subject: 'reactify.channel.>', durable: 'realtime-channel-consumer' },
      { stream: Streams.PROJECTS, subject: 'reactify.project.>', durable: 'realtime-project-consumer' },
      { stream: Streams.PROJECTS, subject: 'reactify.task.>', durable: 'realtime-task-consumer' },
      { stream: Streams.PROJECTS, subject: 'reactify.approval.>', durable: 'realtime-approval-consumer' },
      { stream: Streams.NOTIFICATIONS, subject: 'reactify.notification.>', durable: 'realtime-notification-consumer' },
      { stream: Streams.MEETINGS, subject: 'reactify.meeting.>', durable: 'realtime-meeting-consumer' },
      { stream: Streams.MEETINGS, subject: 'reactify.voice.>', durable: 'realtime-voice-consumer' },
    ];

    for (const c of consumers) {
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

        await this.inbox.handle(data, (envelope) => {
          this.realtime.broadcast(envelope);
        });

        jsMsg.ack();
      } catch (err) {
        this.logger.error(
          {
            stream: def.stream,
            subject: def.subject,
            deliveryCount: jsMsg.info.deliveryCount,
            error: (err as Error).message,
          },
          'Realtime event processing failed',
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
      await js.publish('reactify.realtime.dead', JSON.stringify(payload));
    } catch (publishErr) {
      this.logger.error(
        { error: (publishErr as Error).message },
        'Failed to publish realtime dead-letter event',
      );
    }
  }
}
