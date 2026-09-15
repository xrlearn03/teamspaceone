import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AckPolicy, DeliverPolicy, type JsMsg, type JetStreamSubscription } from 'nats';
import { isEventEnvelope, Streams } from '@teamspace-one/event-contracts';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { LifecycleService } from '../hrms/lifecycle.service.js';

const SUBJECT = 'teamspace-one.interview.application.hired';
const DURABLE = 'hrms-interview-hired';

/**
 * Interview → HRMS hiring handoff: when the interview service marks a
 * candidate application as hired, open a pending employee lifecycle record
 * so HR can start onboarding without re-entering candidate details.
 */
@Injectable()
export class InterviewHiredConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InterviewHiredConsumer.name);
  private subscription: JetStreamSubscription | undefined;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    this.subscription = await js.subscribe(SUBJECT, {
      stream: Streams.INTERVIEW,
      config: {
        durable_name: DURABLE,
        deliver_subject: DURABLE,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        max_deliver: 5,
        max_ack_pending: 100,
      },
    });

    this.consume().catch((err) => {
      this.logger.error(`Interview hired consumer error: ${(err as Error).message}`);
    });
  }

  async onModuleDestroy() {
    try {
      await this.subscription?.drain();
    } catch {
      // already closed
    }
  }

  private async consume() {
    if (!this.subscription) return;
    for await (const msg of this.subscription) {
      const jsMsg = msg as JsMsg;
      try {
        const data = JSON.parse(new TextDecoder().decode(jsMsg.data));
        if (!isEventEnvelope(data)) {
          jsMsg.ack();
          continue;
        }

        const payload = data.payload as Record<string, unknown> | undefined;
        const applicationId = payload?.applicationId;
        const candidateName = payload?.candidateName;
        const candidateEmail = payload?.candidateEmail;
        if (
          typeof applicationId !== 'string' ||
          !applicationId ||
          typeof candidateName !== 'string' ||
          !candidateName ||
          typeof candidateEmail !== 'string' ||
          !candidateEmail
        ) {
          this.logger.warn('application.hired event missing required payload fields');
          jsMsg.ack();
          continue;
        }

        const jobTitle =
          typeof payload?.jobTitle === 'string' ? payload.jobTitle : undefined;

        await this.inbox.handle(data, SUBJECT, (tx) =>
          this.lifecycle.createPendingFromHire(
            data.organisationId,
            {
              candidateName,
              candidateEmail,
              sourceId: applicationId,
              jobTitle,
            },
            tx,
            data.actorId,
          ),
        );
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Failed to process application.hired: ${(err as Error).message}`);
        if (jsMsg.info.deliveryCount >= 5) {
          jsMsg.term('Max delivery attempts exceeded');
        } else {
          jsMsg.nak(5000);
        }
      }
    }
  }
}
