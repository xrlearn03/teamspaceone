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
import { OrganisationService } from '../organisation/organisation.service.js';

const SUBJECT = 'teamspace-one.hrms.employee.created';
const DURABLE = 'organisation-hrms-provisioning';

/**
 * HRMS → organisation auto-provisioning: when an employee record is created
 * for a user who is not yet an organisation member, grant them the default
 * membership so they get collaboration access without a manual invite.
 */
@Injectable()
export class HrmsProvisioningConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrmsProvisioningConsumer.name);
  private subscription: JetStreamSubscription | undefined;

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly organisation: OrganisationService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    this.subscription = await js.subscribe(SUBJECT, {
      stream: Streams.HRMS,
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
      this.logger.error(`HRMS provisioning consumer error: ${(err as Error).message}`);
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

        const userId = (data.payload as Record<string, unknown> | undefined)?.userId;
        if (typeof userId !== 'string' || !userId) {
          this.logger.warn('employee.created event missing payload.userId');
          jsMsg.ack();
          continue;
        }

        await this.inbox.handle(data, (tx) =>
          this.organisation.provisionMembershipFromEmployee(tx, data.organisationId, userId),
        );
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Failed to process employee.created: ${(err as Error).message}`);
        if (jsMsg.info.deliveryCount >= 5) {
          jsMsg.term('Max delivery attempts exceeded');
        } else {
          jsMsg.nak(5000);
        }
      }
    }
  }
}
