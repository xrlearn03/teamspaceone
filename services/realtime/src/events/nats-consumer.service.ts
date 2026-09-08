import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, nanos, type JsMsg } from 'nats';
import { isEventEnvelope, Subjects, type EventEnvelope, Streams } from '@teamspace-one/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AccessService } from '../realtime/access.service.js';
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
    private readonly access: AccessService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();
    const nc = await this.natsClient.getConnection();
    const jsm = await nc.jetstreamManager();

    const consumers: ConsumerDefinition[] = [
      { stream: Streams.MESSAGING, subject: 'teamspace-one.message.>', durable: 'realtime-message-consumer' },
      { stream: Streams.MESSAGING, subject: 'teamspace-one.channel.>', durable: 'realtime-channel-consumer' },
      { stream: Streams.PROJECTS, subject: 'teamspace-one.project.>', durable: 'realtime-project-consumer' },
      { stream: Streams.PROJECTS, subject: 'teamspace-one.task.>', durable: 'realtime-task-consumer' },
      { stream: Streams.PROJECTS, subject: 'teamspace-one.approval.>', durable: 'realtime-approval-consumer' },
      { stream: Streams.NOTIFICATIONS, subject: 'teamspace-one.notification.>', durable: 'realtime-notification-consumer' },
      { stream: Streams.MEETINGS, subject: 'teamspace-one.meeting.>', durable: 'realtime-meeting-consumer' },
      { stream: Streams.MEETINGS, subject: 'teamspace-one.voice.>', durable: 'realtime-voice-consumer' },
      { stream: Streams.ORGANISATION, subject: 'teamspace-one.organisation.>', durable: 'realtime-organisation-consumer' },
      { stream: Streams.ORGANISATION, subject: 'teamspace-one.workspace.>', durable: 'realtime-workspace-consumer' },
      { stream: Streams.ORGANISATION, subject: 'teamspace-one.client.>', durable: 'realtime-client-consumer' },
      { stream: Streams.ORGANISATION, subject: 'teamspace-one.guest.>', durable: 'realtime-guest-consumer' },
      { stream: Streams.HRMS, subject: 'teamspace-one.hrms.>', durable: 'realtime-hrms-consumer' },
      { stream: Streams.INTERVIEW, subject: 'teamspace-one.interview.>', durable: 'realtime-interview-consumer' },
      { stream: Streams.FILES, subject: 'teamspace-one.file.>', durable: 'realtime-file-consumer' },
      { stream: Streams.AI, subject: 'teamspace-one.ai.>', durable: 'realtime-ai-consumer' },
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

        await this.inbox.handle(data, async (tx, envelope) => {
          await this.access.applyEvent(tx, envelope);
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
      await js.publish('teamspace-one.realtime.dead', JSON.stringify(payload));
    } catch (publishErr) {
      this.logger.error(
        { error: (publishErr as Error).message },
        'Failed to publish realtime dead-letter event',
      );
    }
  }
}
