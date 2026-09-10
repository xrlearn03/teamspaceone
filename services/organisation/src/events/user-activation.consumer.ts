import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AckPolicy, DeliverPolicy, type JsMsg, type JetStreamSubscription } from 'nats';
import { isEventEnvelope, Streams, Subjects } from '@teamspace-one/event-contracts';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { OrganisationService } from '../organisation/organisation.service.js';

const SUBJECT = Subjects.USER_UPDATED;
const DURABLE = 'organisation-user-activation';

/**
 * Auth → organisation: when an invited account completes its first password
 * change the auth service emits user.updated with payload.activated = true.
 * Pending invitations linked to that userId are then marked accepted so they
 * leave the "pending invitations" list.
 */
@Injectable()
export class UserActivationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserActivationConsumer.name);
  private subscription: JetStreamSubscription | undefined;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly organisation: OrganisationService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    this.subscription = await js.subscribe(SUBJECT, {
      stream: Streams.USERS,
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
      this.logger.error(`User activation consumer error: ${(err as Error).message}`);
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
        const userId = typeof payload?.id === 'string' ? payload.id : undefined;
        if (payload?.activated !== true || !userId) {
          jsMsg.ack();
          continue;
        }

        await this.inbox.handle(data, (tx) => this.organisation.markInvitationAccepted(tx, userId));
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Failed to process user.updated: ${(err as Error).message}`);
        if (jsMsg.info.deliveryCount >= 5) {
          jsMsg.term('Max delivery attempts exceeded');
        } else {
          jsMsg.nak(5000);
        }
      }
    }
  }
}
