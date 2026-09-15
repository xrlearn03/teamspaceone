import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AckPolicy, DeliverPolicy, type JsMsg, type JetStreamSubscription } from 'nats';
import { isEventEnvelope, Streams, Subjects, type EventEnvelope } from '@teamspace-one/event-contracts';
import type { Prisma } from '#prisma';
import { NatsClientService } from './nats-client.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { OrganisationService } from '../organisation/organisation.service.js';

/**
 * HRMS → organisation provisioning:
 *  - `hrms.employee.created` grants the default membership to employees whose
 *    record was created for an existing user (collaboration access without a
 *    manual invite).
 *  - `hrms.employee.invited` turns an HR-triggered invite into a membership +
 *    pending invitation + MEMBER_INVITED so the notification service emails
 *    the login credentials.
 */
@Injectable()
export class HrmsProvisioningConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrmsProvisioningConsumer.name);
  private subscriptions: JetStreamSubscription[] = [];

  constructor(
    private readonly natsClient: NatsClientService,
    private readonly inbox: InboxService,
    private readonly organisation: OrganisationService,
  ) {}

  async onModuleInit() {
    const js = await this.natsClient.getJetStream();

    const targets = [
      { subject: Subjects.HRMS_EMPLOYEE_CREATE, durable: 'organisation-hrms-provisioning' },
      { subject: Subjects.HRMS_EMPLOYEE_INVITED, durable: 'organisation-hrms-employee-invite' },
    ];

    for (const target of targets) {
      const subscription = await js.subscribe(target.subject, {
        stream: Streams.HRMS,
        config: {
          durable_name: target.durable,
          deliver_subject: target.durable,
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.All,
          max_deliver: 5,
          max_ack_pending: 100,
        },
      });
      this.subscriptions.push(subscription);
      this.consume(subscription).catch((err) => {
        this.logger.error(`HRMS provisioning consumer error: ${(err as Error).message}`);
      });
    }
  }

  async onModuleDestroy() {
    for (const subscription of this.subscriptions) {
      try {
        await subscription.drain();
      } catch {
        // already closed
      }
    }
  }

  private async consume(subscription: JetStreamSubscription) {
    for await (const msg of subscription) {
      const jsMsg = msg as JsMsg;
      try {
        const data = JSON.parse(new TextDecoder().decode(jsMsg.data));
        if (!isEventEnvelope(data)) {
          jsMsg.ack();
          continue;
        }

        const payload = (data.payload ?? {}) as Record<string, unknown>;
        const userId = payload.userId;
        if (typeof userId !== 'string' || !userId) {
          this.logger.warn(`${data.eventType} event missing payload.userId`);
          jsMsg.ack();
          continue;
        }
        if (
          data.eventType === Subjects.HRMS_EMPLOYEE_INVITED &&
          (typeof payload.email !== 'string' || !payload.email)
        ) {
          this.logger.warn('hrms.employee.invited event missing payload.email');
          jsMsg.ack();
          continue;
        }

        await this.inbox.handle(data, (tx) => this.dispatch(tx, data, userId));
        jsMsg.ack();
      } catch (err) {
        this.logger.error(`Failed to process HRMS event: ${(err as Error).message}`);
        if (jsMsg.info.deliveryCount >= 5) {
          jsMsg.term('Max delivery attempts exceeded');
        } else {
          jsMsg.nak(5000);
        }
      }
    }
  }

  private dispatch(tx: Prisma.TransactionClient, data: EventEnvelope, userId: string) {
    if (data.eventType === Subjects.HRMS_EMPLOYEE_INVITED) {
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      return this.organisation.provisionEmployeeInvite(tx, data.organisationId, {
        employeeId: typeof payload.employeeId === 'string' ? payload.employeeId : undefined,
        userId,
        email: typeof payload.email === 'string' ? payload.email : '',
        firstName: typeof payload.firstName === 'string' ? payload.firstName : undefined,
        lastName: typeof payload.lastName === 'string' ? payload.lastName : undefined,
        temporaryPassword: typeof payload.temporaryPassword === 'string' ? payload.temporaryPassword : undefined,
        accountCreated: payload.accountCreated === true,
        invitedBy: typeof payload.invitedBy === 'string' ? payload.invitedBy : undefined,
      });
    }
    return this.organisation.provisionMembershipFromEmployee(tx, data.organisationId, userId);
  }
}
