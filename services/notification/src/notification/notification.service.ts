import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { createEventEnvelope, Subjects, type EventEnvelope } from '@teamspace-one/event-contracts';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';

export interface NotificationPreferenceInput {
  inApp?: boolean;
  email?: boolean;
  desktop?: boolean;
  push?: boolean;
}

export interface CreatedNotification {
  id: string;
  deliveryIds: string[];
}

interface NotificationInput {
  organisationId: string;
  userId: string;
  actorId?: string;
  eventId: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  workspaceId?: string;
  title: string;
  body: string;
  link?: string;
}

interface ChannelFlags {
  inApp: boolean;
  email: boolean;
  desktop: boolean;
  push: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    @InjectQueue('notification') private readonly notificationQueue: Queue,
  ) {}

  shouldNotify(eventType: string): boolean {
    return (
      [
        Subjects.MESSAGE_CREATED,
        Subjects.MESSAGE_UPDATED,
        Subjects.MESSAGE_DELETED,
        Subjects.TASK_CREATED,
        Subjects.TASK_UPDATED,
        Subjects.TASK_COMPLETED,
        Subjects.MEETING_CREATED,
        Subjects.MEETING_STARTED,
        Subjects.MEETING_ENDED,
        Subjects.MEETING_PARTICIPANT_JOINED,
        Subjects.FILE_UPLOADED,
        Subjects.FILE_PROCESSED,
      ] as string[]
    ).includes(eventType);
  }

  async createFromEvent(
    tx: Prisma.TransactionClient,
    envelope: EventEnvelope,
  ): Promise<CreatedNotification[]> {
    if (!this.shouldNotify(envelope.eventType)) {
      return [];
    }

    const notifications = this.deriveNotifications(envelope);
    const created: CreatedNotification[] = [];

    for (const n of notifications) {
      const preference = await this.getPreference(tx, n.organisationId, n.userId, n.eventType);
      const channels = this.selectChannels(preference, n.eventType);

      if (!channels.inApp && !channels.email && !channels.desktop && !channels.push) {
        continue;
      }

      const deliveryCreates = this.buildDeliveryCreates(channels);
      const id = randomUUID();

      const notification = await tx.notification.create({
        data: {
          id,
          organisationId: n.organisationId,
          userId: n.userId,
          actorId: n.actorId,
          eventId: n.eventId,
          eventType: n.eventType,
          resourceType: n.resourceType,
          resourceId: n.resourceId,
          workspaceId: n.workspaceId,
          title: n.title,
          body: n.body,
          link: n.link,
          deliveries: {
            create: deliveryCreates,
          },
        },
        include: { deliveries: true },
      });

      const notificationPayload = {
        id: notification.id,
        organisationId: notification.organisationId,
        workspaceId: notification.workspaceId,
        userId: notification.userId,
        actorId: notification.actorId,
        eventType: notification.eventType,
        resourceType: notification.resourceType,
        resourceId: notification.resourceId,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        read: notification.read,
      };

      const outbox = createEventEnvelope({
        eventType: Subjects.NOTIFICATION_CREATED,
        organisationId: notification.organisationId,
        workspaceId: notification.workspaceId ?? undefined,
        actorId: notification.userId,
        resourceType: 'notification',
        resourceId: notification.id,
        correlationId: envelope.correlationId,
        causationId: envelope.eventId,
        payload: notificationPayload,
      });

      await this.outbox.createEvent(tx, outbox, Subjects.NOTIFICATION_CREATED);

      created.push({
        id: notification.id,
        deliveryIds: notification.deliveries.map((d) => d.id),
      });
    }

    return created;
  }

  async enqueueDeliveries(deliveryIds: string[]): Promise<void> {
    for (const deliveryId of deliveryIds) {
      try {
        await this.notificationQueue.add(
          'send',
          { deliveryId },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
        );
      } catch (err) {
        this.logger.error(
          { deliveryId, error: (err as Error).message },
          'Failed to enqueue notification delivery',
        );
      }
    }
  }

  private deriveNotifications(envelope: EventEnvelope): NotificationInput[] {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const organisationId = envelope.organisationId;
    const workspaceId = envelope.workspaceId;
    const actorId = envelope.actorId;
    const eventType = envelope.eventType;

    switch (eventType) {
      case Subjects.MESSAGE_CREATED: {
        const mentionedUserIds = this.extractMentions(String(payload.content ?? ''));
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]) : [];
        const allRecipients = [...new Set([...recipientIds, ...mentionedUserIds])];
        return allRecipients
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'message',
            resourceId: payload.id as string,
            title: 'New message',
            body: `New message in channel ${payload.channelId as string}`,
            link: this.messageLink(organisationId, payload.channelId as string, payload.id as string),
          }));
      }
      case Subjects.MESSAGE_UPDATED: {
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]) : [];
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'message',
            resourceId: payload.id as string,
            title: 'Message updated',
            body: `A message in channel ${payload.channelId as string} was updated`,
            link: this.messageLink(organisationId, payload.channelId as string, payload.id as string),
          }));
      }
      case Subjects.TASK_CREATED:
      case Subjects.TASK_UPDATED:
      case Subjects.TASK_COMPLETED: {
        const userId = (payload.assigneeId as string) || actorId;
        if (!userId || userId === actorId) return [];
        const isCompleted = eventType === Subjects.TASK_COMPLETED;
        return [
          {
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'task',
            resourceId: payload.id as string,
            title: isCompleted ? 'Task completed' : 'Task updated',
            body: `Task ${payload.title || payload.id} ${isCompleted ? 'was completed' : 'was updated'}`,
            link: this.taskLink(organisationId, payload.projectId as string, payload.id as string),
          },
        ];
      }
      case Subjects.MEETING_STARTED: {
        const attendees = Array.isArray(payload.attendeeIds) ? (payload.attendeeIds as string[]) : [];
        return attendees
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'meeting',
            resourceId: payload.id as string,
            title: 'Meeting started',
            body: `Meeting ${payload.title || payload.id} has started`,
            link: this.meetingLink(organisationId, payload.id as string),
          }));
      }
      case Subjects.FILE_UPLOADED:
      case Subjects.FILE_PROCESSED: {
        const userId = (payload.uploaderId as string) || actorId;
        if (!userId) return [];
        return [
          {
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'file',
            resourceId: payload.id as string,
            title: 'File uploaded',
            body: `File ${payload.name || payload.id} was uploaded`,
            link: this.fileLink(organisationId, payload.id as string),
          },
        ];
      }
      default:
        return [];
    }
  }

  private extractMentions(content: string): string[] {
    if (!content) return [];
    const matches = content.match(/<@([a-zA-Z0-9_-]+)>/g) || [];
    return matches.map((m) => m.slice(2, -1));
  }

  private messageLink(organisationId: string, channelId: string | undefined, messageId: string | undefined) {
    return `/organisations/${organisationId}/channels/${channelId ?? ''}/messages/${messageId ?? ''}`;
  }

  private taskLink(organisationId: string, projectId: string | undefined, taskId: string | undefined) {
    return `/organisations/${organisationId}/projects/${projectId ?? ''}/tasks/${taskId ?? ''}`;
  }

  private meetingLink(organisationId: string, meetingId: string | undefined) {
    return `/organisations/${organisationId}/meetings/${meetingId ?? ''}`;
  }

  private fileLink(organisationId: string, fileId: string | undefined) {
    return `/organisations/${organisationId}/files/${fileId ?? ''}`;
  }

  private buildDeliveryCreates(channels: ChannelFlags) {
    const creates: { channel: 'in_app' | 'email' | 'desktop' | 'push'; status: 'pending' }[] = [];
    if (channels.email) creates.push({ channel: 'email', status: 'pending' });
    if (channels.desktop) creates.push({ channel: 'desktop', status: 'pending' });
    if (channels.push) creates.push({ channel: 'push', status: 'pending' });
    return creates;
  }

  private async getPreference(
    tx: Prisma.TransactionClient,
    organisationId: string,
    userId: string,
    eventType: string,
  ): Promise<ChannelFlags> {
    const preference = await tx.notificationPreference.findUnique({
      where: { organisationId_userId_eventType: { organisationId, userId, eventType } },
    });
    if (preference) {
      return {
        inApp: preference.inApp,
        email: preference.email,
        desktop: preference.desktop,
        push: preference.push,
      };
    }
    return { inApp: true, email: false, desktop: true, push: false };
  }

  private selectChannels(preference: ChannelFlags, _eventType: string): ChannelFlags {
    return preference;
  }

  async list(
    ctx: { organisationId: string; actorId?: string },
    options: { unreadOnly?: boolean; limit?: number; cursor?: string } = {},
  ) {
    const where: Prisma.NotificationWhereInput = {
      organisationId: ctx.organisationId,
      userId: ctx.actorId,
    };
    if (options.unreadOnly) where.read = false;

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.cursor ? 1 : 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      include: { deliveries: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async markRead(ctx: { organisationId: string; actorId?: string }, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, organisationId: ctx.organisationId, userId: ctx.actorId },
      data: { read: true },
    });
  }

  async markAllRead(ctx: { organisationId: string; actorId?: string }) {
    return this.prisma.notification.updateMany({
      where: { organisationId: ctx.organisationId, userId: ctx.actorId, read: false },
      data: { read: true },
    });
  }

  async getPreferenceForUser(ctx: { organisationId: string; actorId?: string }, eventType: string) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    return this.prisma.notificationPreference.findUnique({
      where: {
        organisationId_userId_eventType: {
          organisationId: ctx.organisationId,
          userId,
          eventType,
        },
      },
    });
  }

  async setPreferenceForUser(
    ctx: { organisationId: string; actorId?: string },
    eventType: string,
    input: NotificationPreferenceInput,
  ) {
    const userId = ctx.actorId;
    if (!userId) throw new ForbiddenException('Missing actor');
    return this.prisma.notificationPreference.upsert({
      where: {
        organisationId_userId_eventType: {
          organisationId: ctx.organisationId,
          userId,
          eventType,
        },
      },
      create: {
        id: randomUUID(),
        organisationId: ctx.organisationId,
        userId,
        eventType,
        inApp: input.inApp ?? true,
        email: input.email ?? false,
        desktop: input.desktop ?? true,
        push: input.push ?? false,
      },
      update: {
        inApp: input.inApp,
        email: input.email,
        desktop: input.desktop,
        push: input.push,
      },
    });
  }

  async countUnread(ctx: { organisationId: string; actorId?: string }) {
    return this.prisma.notification.count({
      where: {
        organisationId: ctx.organisationId,
        userId: ctx.actorId,
        read: false,
      },
    });
  }
}
