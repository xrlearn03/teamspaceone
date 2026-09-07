import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AckPolicy, DeliverPolicy, type JsMsg, type JetStreamSubscription } from 'nats';
import { ModuleRef } from '@nestjs/core';
import { isEventEnvelope, type EventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { LifecycleService } from '../hrms/lifecycle.service.js';
import { EmployeesService } from '../hrms/employees.service.js';

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
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    this.subscription = await js.subscribe('teamspace-one.hrms.>', {
      config: {
        durable_name: 'hrms-consumer',
        deliver_subject: 'hrms-consumer',
        deliver_group: 'hrms-consumers',
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

        await this.inbox.handle(data, jsMsg.subject, this.handlerFor(data));
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

  /**
   * Lifecycle automation: `employee.created` auto-starts onboarding from the
   * organisation's default template. LifecycleService is resolved lazily via
   * ModuleRef to avoid an EventsModule ↔ HrmsModule provider cycle.
   */
  private handlerFor(envelope: EventEnvelope) {
    if (envelope.eventType === 'teamspace-one.hrms.employee.created') {
      const employeeId = envelope.resourceId;
      if (typeof employeeId !== 'string' || !employeeId) return undefined;
      return async () => {
        const lifecycle = this.moduleRef.get(LifecycleService, { strict: false });
        await lifecycle.autoStartForEmployee(
          envelope.organisationId,
          employeeId,
          envelope.actorId ?? undefined,
        );
      };
    }

    if (envelope.eventType === 'teamspace-one.hrms.employee.create') {
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;
      if (
        typeof payload.userId !== 'string' ||
        typeof payload.firstName !== 'string' ||
        typeof payload.lastName !== 'string'
      ) {
        return undefined;
      }
      return async (tx: Prisma.TransactionClient) => {
        const employees = this.moduleRef.get(EmployeesService, { strict: false });
        if (!employees) return;
        await employees.create(
          {
            organisationId: envelope.organisationId,
            actorId: envelope.actorId ?? '',
            correlationId: envelope.correlationId ?? undefined,
            userId: payload.userId as string,
            firstName: payload.firstName as string,
            lastName: payload.lastName as string,
            membershipId: typeof payload.membershipId === 'string' ? payload.membershipId : undefined,
            workEmail: typeof payload.workEmail === 'string' ? payload.workEmail : undefined,
            joiningDate: new Date(),
          },
          tx,
        );
      };
    }

    return undefined;
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
