import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects, type EventEnvelope } from '@reactify/event-contracts';
import { Prisma } from '#prisma';
import { OutboxService } from '../outbox/outbox.service.js';

interface NotificationPayload {
  id: string;
  organisationId: string;
  userId: string;
  eventId: string;
  eventType: string;
  title: string;
  body: string;
}

@Injectable()
export class NotificationService {
  constructor(private readonly outbox: OutboxService) {}

  shouldNotify(eventType: string): boolean {
    return ([Subjects.MESSAGE_CREATED, Subjects.TASK_COMPLETED, Subjects.TASK_UPDATED, Subjects.MEETING_STARTED] as string[]).includes(eventType);
  }

  deriveRecipient(envelope: EventEnvelope): { userId: string | undefined; title: string; body: string } {
    const payload = (envelope.payload ?? {}) as Record<string, any>;
    const eventType = envelope.eventType;

    if (eventType === Subjects.MESSAGE_CREATED) {
      return {
        userId: payload.senderId as string,
        title: 'New message',
        body: `New message in channel ${payload.channelId as string}`,
      };
    }

    if (eventType === Subjects.TASK_COMPLETED) {
      return {
        userId: payload.assigneeId as string || envelope.actorId,
        title: 'Task completed',
        body: `Task ${payload.title as string || payload.id as string} was completed`,
      };
    }

    if (eventType === Subjects.TASK_UPDATED) {
      return {
        userId: payload.assigneeId as string || envelope.actorId,
        title: 'Task updated',
        body: `Task ${payload.title as string || payload.id as string} was updated`,
      };
    }

    if (eventType === Subjects.MEETING_STARTED) {
      return {
        userId: envelope.actorId,
        title: 'Meeting started',
        body: `Meeting ${payload.id as string} has started`,
      };
    }

    return { userId: envelope.actorId, title: 'Notification', body: 'An event occurred' };
  }

  async createFromEvent(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<NotificationPayload | undefined> {
    if (!this.shouldNotify(envelope.eventType)) {
      return undefined;
    }

    const { userId, title, body } = this.deriveRecipient(envelope);
    if (!userId) return undefined;

    const id = randomUUID();
    const payload: NotificationPayload = {
      id,
      organisationId: envelope.organisationId,
      userId,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      title,
      body,
    };

    const outbox = createEventEnvelope({
      eventType: Subjects.NOTIFICATION_CREATED,
      organisationId: envelope.organisationId,
      actorId: userId,
      resourceType: 'notification',
      resourceId: id,
      correlationId: envelope.correlationId,
      payload,
    });

    await tx.notification.create({ data: payload });
    await this.outbox.createEvent(tx, outbox, Subjects.NOTIFICATION_CREATED);
    return payload;
  }
}
