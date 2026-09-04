import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AckPolicy, DeliverPolicy, ReplayPolicy, createInbox, headers, type JsMsg } from 'nats';
import { isEventEnvelope, type EventEnvelope } from '@teamspace-one/event-contracts';
import { getTraceContextHeaders } from '@teamspace-one/opentelemetry';
import { MetricsService } from '@teamspace-one/metrics';
import { PrismaService } from '../prisma/prisma.service.js';
import { NatsClientService } from './nats-client.service.js';

export interface ReplayInput {
  stream: string;
  subject: string;
  from: string;
  to: string;
  targetSubject?: string;
  organisationId: string;
}

@Injectable()
export class ReplayService {
  private readonly logger = new Logger(ReplayService.name);
  private readonly replayCounter;

  constructor(
    private readonly nats: NatsClientService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {
    this.replayCounter = this.metrics.counter(
      'teamspaceone_events_replayed_total',
      'Total events replayed by the audit service',
      ['subject'],
    );
  }

  async replay(input: ReplayInput): Promise<{ replayed: number; to: string; from: string }> {
    const fromTime = new Date(input.from);
    const toTime = new Date(input.to);

    if (Number.isNaN(fromTime.getTime()) || Number.isNaN(toTime.getTime())) {
      throw new BadRequestException('Invalid from or to date');
    }

    const js = await this.nats.getJetStream();
    const natsHeaders = headers();
    for (const [k, v] of Object.entries(getTraceContextHeaders())) {
      natsHeaders.append(k, v);
    }

    const subscription = await js.subscribe(input.subject, {
      config: {
        deliver_policy: DeliverPolicy.StartTime,
        opt_start_time: fromTime.toISOString(),
        filter_subjects: [input.subject],
        ack_policy: AckPolicy.Explicit,
        deliver_subject: createInbox(),
        replay_policy: ReplayPolicy.Instant,
      },
    });

    const replayed: string[] = [];

    try {
      for await (const msg of subscription) {
        const jsMsg = msg as JsMsg;
        const raw = new TextDecoder().decode(jsMsg.data);
        let data: unknown;

        try {
          data = JSON.parse(raw);
        } catch (err) {
          this.logger.warn({ subject: input.subject, error: (err as Error).message }, 'Replayed message is not JSON');
          jsMsg.ack();
          continue;
        }

        if (!isEventEnvelope(data)) {
          jsMsg.ack();
          continue;
        }

        const envelope = data as EventEnvelope;
        const occurredAt = new Date(envelope.occurredAt);

        if (occurredAt.getTime() > toTime.getTime()) {
          jsMsg.ack();
          break;
        }

        if (envelope.organisationId !== input.organisationId) {
          jsMsg.ack();
          continue;
        }

        const target = input.targetSubject ?? envelope.eventType;
        await js.publish(target, raw, { headers: natsHeaders });
        replayed.push(envelope.eventId);
        this.replayCounter.inc({ subject: input.subject });

        jsMsg.ack();
      }
    } finally {
      try {
        await subscription.destroy();
      } catch {
        // ignore
      }
    }

    this.logger.log(
      { stream: input.stream, subject: input.subject, replayed: replayed.length },
      'Replay completed',
    );

    return { replayed: replayed.length, to: input.to, from: input.from };
  }
}
