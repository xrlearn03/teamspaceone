import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AckPolicy, type JsMsg } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@reactify/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { AiService } from '../ai/ai.service.js';
import { NatsClientService } from './nats-client.service.js';

@Injectable()
export class NatsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(NatsConsumerService.name);

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly ai: AiService,
  ) {}

  async onModuleInit() {
    const subjects = [
      'reactify.message.>',
      'reactify.task.>',
      'reactify.file.>',
      'reactify.meeting.>',
    ];

    await Promise.all(
      subjects.map((subject) => {
        const durable = `ai-consumer-${subject.replace(/[^a-zA-Z0-9]/g, '-')}`;
        return this.consume(subject, durable);
      }),
    );
  }

  private async consume(subject: string, durable: string) {
    const js = await this.natsClient.getJetStream();
    this.logger.log({ subject, durable }, 'Subscribing to NATS JetStream subject');

    const subscription = await js.subscribe(subject, {
      config: {
        durable_name: durable,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: 'all' as any,
      },
    });

    this.consumeLoop(subject, subscription).catch((err) => {
      this.logger.error({ subject, error: (err as Error).message }, 'NATS consumer error');
    });
  }

  private async consumeLoop(subject: string, subscription: any) {
    for await (const msg of subscription) {
      const jsMsg = msg as JsMsg;
      try {
        const raw = new TextDecoder().decode(jsMsg.data);
        const data = JSON.parse(raw) as EventEnvelope;
        if (!isEventEnvelope(data)) {
          this.logger.warn({ subject }, 'Received invalid event envelope');
          jsMsg.ack();
          continue;
        }

        await this.inbox.handle(data, (tx, envelope) => this.ai.handleEvent(tx, envelope));
        jsMsg.ack();

        this.ai.ingest(data).catch((err: Error) => {
          this.logger.error({ eventId: data.eventId, error: err.message }, 'AI ingest enqueue failed');
        });
      } catch (err) {
        this.logger.error({ subject, error: (err as Error).message }, 'Event processing failed');
        jsMsg.nak(5000);
      }
    }
  }
}
