import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AckPolicy,
  DeliverPolicy,
  type ConsumerConfig,
  type Consumer,
  type ConsumerMessages,
  type JetStreamManager,
  type JetStreamClient,
  type JsMsg,
} from 'nats';
import { isEventEnvelope, streamConfigs, type EventEnvelope, type StreamName } from '@teamspace-one/event-contracts';
import { InboxService } from '../inbox/inbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from '../search/search.service.js';
import { NatsClientService } from './nats-client.service.js';

const MAX_DELIVERY = 5;
const DLQ_SUBJECT = 'teamspace-one.dlq.search';
const SEARCH_STREAMS: StreamName[] = ['MESSAGING', 'PROJECTS', 'FILES', 'MEETINGS', 'AI', 'ORGANISATION', 'USERS', 'HRMS', 'INTERVIEW'];

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsConsumerService.name);
  private readonly consumers: Consumer[] = [];
  private readonly iterators: ConsumerMessages[] = [];
  private backfillPromise?: Promise<{ processed: number }>;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly search: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const manager = await this.natsClient.getManager();
    const js = await this.natsClient.getJetStream();

    for (const stream of SEARCH_STREAMS) {
      const consumer = await this.ensureConsumer(manager, js, stream);
      this.consumers.push(consumer);
      const messages = await consumer.consume({ max_messages: 10 });
      this.iterators.push(messages);
      this.consumeMessages(messages).catch((err) => {
        this.logger.error(`Consumer ${stream} error: ${(err as Error).message}`);
      });
    }
  }

  async onModuleDestroy() {
    for (const iter of this.iterators) {
      try {
        await iter.close();
      } catch {
        // ignored
      }
    }
  }

  backfill(): Promise<{ processed: number }> {
    if (!this.backfillPromise) {
      this.backfillPromise = this.runBackfill().finally(() => {
        this.backfillPromise = undefined;
      });
    }
    return this.backfillPromise;
  }

  private async runBackfill(): Promise<{ processed: number }> {
    const manager = await this.natsClient.getManager();
    const js = await this.natsClient.getJetStream();
    let processed = 0;

    for (const stream of SEARCH_STREAMS) {
      const name = `search-backfill-${stream.toLowerCase()}-${Date.now()}`;
      const streamConfig = streamConfigs.find((config) => config.name === stream);
      await manager.consumers.add(stream, {
        name,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        filter_subjects: streamConfig?.subjects ?? [`teamspace-one.${stream.toLowerCase()}.>`],
      });
      try {
        const consumer = await js.consumers.get(stream, name);
        let batchSize: number;
        do {
          batchSize = 0;
          const messages = await consumer.fetch({ max_messages: 500, expires: 1000 });
          for await (const msg of messages) {
            batchSize++;
            const envelope = msg.json<EventEnvelope>();
            if (!isEventEnvelope(envelope)) {
              msg.term('invalid-envelope');
              continue;
            }
            await this.prisma.$transaction((tx) => this.isDeleteEvent(envelope)
              ? this.search.remove(tx, envelope)
              : this.search.upsert(tx, envelope));
            msg.ack();
            processed++;
          }
        } while (batchSize === 500);
      } finally {
        await manager.consumers.delete(stream, name);
      }
    }

    return { processed };
  }

  private async ensureConsumer(
    manager: JetStreamManager,
    js: JetStreamClient,
    stream: StreamName,
  ): Promise<Consumer> {
    const durableName = `search-service-${stream.toLowerCase()}`;
    const streamConfig = streamConfigs.find((c) => c.name === stream);
    const filterSubjects = streamConfig?.subjects ?? [`teamspace-one.${stream.toLowerCase()}.>`];

    const config: Partial<ConsumerConfig> = {
      durable_name: durableName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      max_deliver: MAX_DELIVERY,
      ack_wait: 30_000_000_000,
      backoff: [1_000_000_000, 5_000_000_000, 15_000_000_000, 60_000_000_000],
      filter_subjects: filterSubjects,
      description: `Search service consumer for ${stream}`,
    };

    try {
      const existing = await js.consumers.get(stream, durableName);
      this.logger.log(`Using existing consumer ${durableName} on stream ${stream}`);
      return existing;
    } catch {
      // consumer does not exist
    }

    try {
      await manager.consumers.add(stream, config);
      this.logger.log(`Created consumer ${durableName} on stream ${stream}`);
      return await js.consumers.get(stream, durableName);
    } catch (err) {
      this.logger.error(`Failed to create consumer ${durableName}: ${(err as Error).message}`);
      throw err;
    }
  }

  private async consumeMessages(messages: ConsumerMessages) {
    for await (const msg of messages) {
      await this.handleMessage(msg as JsMsg);
    }
  }

  private async handleMessage(msg: JsMsg) {
    let envelope: EventEnvelope | undefined;
    try {
      envelope = msg.json<EventEnvelope>();
    } catch (err) {
      this.logger.warn(`Failed to parse message: ${(err as Error).message}`);
      msg.term('unparseable');
      return;
    }

    if (!isEventEnvelope(envelope)) {
      this.logger.warn('Received invalid event envelope');
      msg.term('invalid-envelope');
      return;
    }

    try {
      if (this.isDeleteEvent(envelope)) {
        await this.inbox.handle(envelope, (tx, event) => this.search.remove(tx, event));
      } else {
        await this.inbox.handle(envelope, (tx, event) => this.search.upsert(tx, event));
      }
      msg.ack();
    } catch (err) {
      this.logger.error({ eventId: envelope.eventId, error: (err as Error).message }, 'Event processing failed');
      if (msg.info.deliveryCount >= MAX_DELIVERY) {
        await this.moveToDeadLetter(msg, envelope, (err as Error).message);
      } else {
        msg.nak(5000);
      }
    }
  }

  private isDeleteEvent(envelope: EventEnvelope): boolean {
    return envelope.eventType.endsWith('.deleted');
  }

  private async moveToDeadLetter(msg: JsMsg, envelope: EventEnvelope, reason: string) {
    try {
      const js = await this.natsClient.getJetStream();
      const dlqPayload = {
        originalEvent: envelope,
        deliveryCount: msg.info.deliveryCount,
        reason,
        service: 'search-service',
        failedAt: new Date().toISOString(),
      };
      await js.publish(`${DLQ_SUBJECT}.${envelope.eventType}`, JSON.stringify(dlqPayload));
      this.logger.warn({ eventId: envelope.eventId, reason }, 'Moved event to DLQ');
      msg.term(reason);
    } catch (err) {
      this.logger.error({ eventId: envelope.eventId, error: (err as Error).message }, 'Failed to publish DLQ message');
      msg.nak(5000);
    }
  }
}
