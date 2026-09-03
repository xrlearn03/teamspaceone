import { Injectable, Logger } from '@nestjs/common';
import { createEventEnvelope, type EventEnvelope, type Subject } from '@reactify/event-contracts';
import { NatsClientService } from '../nats/nats-client.service.js';

export interface PublishEventInput {
  organisationId: string;
  workspaceId?: string;
  actorId?: string;
  correlationId: string;
  causationId?: string;
  subject: string;
  payload: unknown;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(private readonly natsClient: NatsClientService) {}

  async publishEvent(input: PublishEventInput): Promise<{ eventId: string; subject: string }> {
    const envelope = createEventEnvelope({
      eventType: input.subject,
      organisationId: input.organisationId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      resourceType: 'gateway-event',
      resourceId: 'gateway',
      correlationId: input.correlationId,
      causationId: input.causationId,
      payload: input.payload,
    });

    const js = this.natsClient.getJetStream();
    await js.publish(input.subject as string, JSON.stringify(envelope));
    this.logger.log({ eventId: envelope.eventId, subject: input.subject }, 'Published event');

    return { eventId: envelope.eventId, subject: input.subject };
  }
}
