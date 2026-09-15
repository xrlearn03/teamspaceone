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
  enqueue?: boolean;
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
  delayMs?: number;
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
        Subjects.TASK_CREATED,
        Subjects.TASK_UPDATED,
        Subjects.TASK_COMPLETED,
        Subjects.MEETING_CREATED,
        Subjects.MEETING_REMINDER,
        Subjects.MEETING_STARTED,
        Subjects.FILE_UPLOADED,
        Subjects.FILE_PROCESSED,
        Subjects.AI_SUMMARY_CONFIRMED,
        Subjects.PROJECT_COMMENT_CREATED,
        Subjects.APPROVAL_CREATED,
        Subjects.APPROVAL_APPROVED,
        Subjects.APPROVAL_REJECTED,
        Subjects.CHANNEL_CREATED,
        Subjects.CHANNEL_MEMBERS_UPDATED,
        Subjects.HRMS_EMPLOYEE_CREATE,
        Subjects.HRMS_LEAVE_REQUESTED,
        Subjects.HRMS_LEAVE_APPROVED,
        Subjects.HRMS_LEAVE_REJECTED,
        Subjects.HRMS_ATTENDANCE_CORRECTION_REQUESTED,
        Subjects.HRMS_ATTENDANCE_CORRECTION_RESOLVED,
        Subjects.HRMS_ONBOARDING_PENDING,
        Subjects.INTERVIEW_SESSION_SCHEDULED,
        Subjects.INTERVIEW_SCREENING_COMPLETED,
        Subjects.INTERVIEW_EVALUATION_READY,
        Subjects.TICKET_CREATED,
        Subjects.TICKET_STATUS_CHANGED,
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

      if (n.delayMs && n.delayMs > 0) {
        for (const d of notification.deliveries) {
          await this.notificationQueue.add(
            'send',
            { deliveryId: d.id },
            { delay: n.delayMs, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
          );
        }
        created.push({ id: notification.id, deliveryIds: notification.deliveries.map((d) => d.id), enqueue: false });
      } else {
        created.push({ id: notification.id, deliveryIds: notification.deliveries.map((d) => d.id) });
      }
    }

    return created;
  }

  async enqueueDeliveries(deliveryIds: string[]): Promise<void> {
    for (const deliveryId of deliveryIds) {
      await this.notificationQueue.add(
        'send',
        { deliveryId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
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
          .map((userId) => {
            const mentioned = mentionedUserIds.includes(userId);
            return {
              organisationId,
              workspaceId,
              userId,
              actorId,
              eventId: envelope.eventId,
              eventType,
              resourceType: 'message',
              resourceId: payload.id as string,
              title: mentioned ? 'You were mentioned' : 'New message',
              body: mentioned
                ? `You were mentioned in channel ${payload.channelId as string}`
                : `New message in channel ${payload.channelId as string}`,
              link: this.messageLink(organisationId, payload.channelId as string, payload.id as string),
            };
          });
      }
      case Subjects.CHANNEL_CREATED: {
        const memberIds = Array.isArray(payload.memberIds) ? (payload.memberIds as string[]) : [];
        const channelType = String(payload.type ?? 'channel');
        const channelName = String(payload.name ?? 'channel');
        const title = channelType === 'direct' ? 'New conversation' : `Added to #${channelName}`;
        const body = channelType === 'direct' ? 'You were added to a conversation' : `You were added to channel ${channelName}`;
        return memberIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'channel',
            resourceId: payload.id as string,
            title,
            body,
            link: this.channelLink(organisationId, payload.id as string),
          }));
      }
      case Subjects.CHANNEL_MEMBERS_UPDATED: {
        const addedMemberIds = Array.isArray(payload.addedMemberIds) ? (payload.addedMemberIds as string[]) : [];
        const channelName = String(payload.name ?? 'channel');
        return addedMemberIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'channel',
            resourceId: payload.id as string,
            title: `Added to #${channelName}`,
            body: `You were added to channel ${channelName}`,
            link: this.channelLink(organisationId, payload.id as string),
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
        const memberIds = Array.isArray(payload.memberIds) ? (payload.memberIds as string[]) : [];
        const assigneeId = (payload.assigneeId as string) || undefined;
        const recipientIds = Array.from(new Set([...memberIds, ...(assigneeId ? [assigneeId] : [])]));
        if (!recipientIds.length) return [];
        const isCompleted = eventType === Subjects.TASK_COMPLETED;
        const deleted = payload.deleted === true;
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'task',
            resourceId: payload.id as string,
            title: deleted ? 'Task deleted' : isCompleted ? 'Task completed' : 'Task updated',
            body: `Task ${payload.title || payload.id} ${deleted ? 'was deleted' : isCompleted ? 'was completed' : 'was updated'}`,
            link: this.taskLink(organisationId, payload.projectId as string, payload.id as string),
          }));
      }
      case Subjects.MEETING_CREATED: {
        const inviteeIds = Array.isArray(payload.inviteeIds) ? (payload.inviteeIds as string[]).filter(Boolean) : [];
        if (!inviteeIds.length) return [];
        const title = String(payload.title ?? 'Meeting');
        const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt as string) : null;
        const when =
          scheduledAt && !Number.isNaN(scheduledAt.getTime())
            ? ` on ${scheduledAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
            : '';
        return inviteeIds
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
            title: 'Meeting invitation',
            body: `You were invited to "${title}"${when}.`,
            link: this.meetingLink(organisationId, payload.id as string),
          }));
      }
      case Subjects.MEETING_REMINDER: {
        const attendees = Array.isArray(payload.attendeeIds) ? (payload.attendeeIds as string[]).filter(Boolean) : [];
        if (!attendees.length) return [];
        const minutes = Math.max(1, Number(payload.minutesUntil ?? 15));
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
            title: 'Meeting starting soon',
            body: `"${String(payload.title ?? 'Meeting')}" starts in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
            link: this.meetingLink(organisationId, payload.id as string),
          }));
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
            body: `Meeting ${payload.title || payload.id} has started — join now`,
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
      case Subjects.AI_SUMMARY_CONFIRMED: {
        const participantIds = Array.isArray(payload.participantIds) ? (payload.participantIds as string[]) : [];
        if (!participantIds.length) return [];
        const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
        return participantIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'ai-summary',
            resourceId: payload.resourceId as string,
            title: `Meeting minutes: ${payload.title || payload.resourceId}`,
            body: summary || `The AI summary for meeting "${payload.title || payload.resourceId}" is ready.`,
            link: this.meetingLink(organisationId, payload.resourceId as string),
          }));
      }
      case Subjects.PROJECT_COMMENT_CREATED: {
        const memberIds = Array.isArray(payload.memberIds) ? (payload.memberIds as string[]) : [];
        const mentionedUserIds = this.extractMentions(String(payload.content ?? ''));
        const allRecipients = [...new Set([...memberIds, ...mentionedUserIds])];
        return allRecipients
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'project',
            resourceId: payload.projectId as string,
            title: 'New project comment',
            body: this.truncate(String(payload.content ?? ''), 120),
            link: this.projectLink(organisationId, payload.projectId as string),
          }));
      }
      case Subjects.APPROVAL_CREATED:
      case Subjects.APPROVAL_APPROVED:
      case Subjects.APPROVAL_REJECTED: {
        const memberIds = Array.isArray(payload.memberIds) ? (payload.memberIds as string[]) : [];
        const requestedBy = (payload.requestedBy as string) || undefined;
        const allRecipients = [...new Set([...memberIds, ...(requestedBy ? [requestedBy] : [])])];
        const status =
          eventType === Subjects.APPROVAL_CREATED
            ? 'requested'
            : eventType === Subjects.APPROVAL_APPROVED
              ? 'approved'
              : 'rejected';
        return allRecipients
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'approval',
            resourceId: payload.approvalId as string,
            title: `Approval ${status}`,
            body: `A ${payload.resourceType as string} approval was ${status}`,
            link: this.approvalLink(organisationId, payload.approvalId as string),
          }));
      }
      case Subjects.HRMS_EMPLOYEE_CREATE: {
        const userId = (payload.userId as string) || undefined;
        if (!userId) return [];
        return [
          {
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'employee',
            resourceId: envelope.resourceId,
            title: 'Welcome to the team',
            body: 'Your employee profile has been created.',
            link: this.hrmsLink(organisationId),
          },
        ];
      }
      case Subjects.HRMS_LEAVE_REQUESTED: {
        const managerUserId = (payload.managerUserId as string) || undefined;
        if (!managerUserId || managerUserId === actorId) return [];
        const name = (payload.employeeName as string) || 'An employee';
        const days = payload.days ?? '';
        return [
          {
            organisationId,
            workspaceId,
            userId: managerUserId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'leave-request',
            resourceId: envelope.resourceId,
            title: 'Leave request pending approval',
            body: `${name} requested ${days} day(s) of ${(payload.leaveTypeName as string) || 'leave'}.`,
            link: this.hrmsLink(organisationId),
          },
        ];
      }
      case Subjects.HRMS_LEAVE_APPROVED: {
        const userId = (payload.userId as string) || undefined;
        if (!userId || userId === actorId) return [];
        const final = payload.status === 'approved';
        return [
          {
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'leave-request',
            resourceId: envelope.resourceId,
            title: final ? 'Leave approved' : 'Leave approved by manager',
            body: final
              ? `Your leave request (${payload.days ?? ''} day(s)) was approved.`
              : 'Your leave request was approved by your manager and is pending HR review.',
            link: this.hrmsLink(organisationId),
          },
        ];
      }
      case Subjects.HRMS_LEAVE_REJECTED: {
        const userId = (payload.userId as string) || undefined;
        if (!userId || userId === actorId) return [];
        return [
          {
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'leave-request',
            resourceId: envelope.resourceId,
            title: 'Leave rejected',
            body: `Your leave request was rejected${payload.reviewNote ? `: ${payload.reviewNote}` : '.'}`,
            link: this.hrmsLink(organisationId),
          },
        ];
      }
      case Subjects.HRMS_ATTENDANCE_CORRECTION_REQUESTED: {
        const managerUserId = (payload.managerUserId as string) || undefined;
        if (!managerUserId || managerUserId === actorId) return [];
        return [
          {
            organisationId,
            workspaceId,
            userId: managerUserId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'attendance-correction',
            resourceId: envelope.resourceId,
            title: 'Attendance correction requested',
            body: `${(payload.employeeName as string) || 'An employee'} requested an attendance correction.`,
            link: this.hrmsLink(organisationId),
          },
        ];
      }
      case Subjects.HRMS_ATTENDANCE_CORRECTION_RESOLVED: {
        const userId = (payload.userId as string) || undefined;
        if (!userId || userId === actorId) return [];
        const status = (payload.status as string) || 'resolved';
        return [
          {
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'attendance-correction',
            resourceId: envelope.resourceId,
            title: `Attendance correction ${status}`,
            body: `Your attendance correction was ${status}${payload.reviewNote ? `: ${payload.reviewNote}` : '.'}`,
            link: this.hrmsLink(organisationId),
          },
        ];
      }
      case Subjects.INTERVIEW_SESSION_SCHEDULED: {
        const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt as string) : null;
        if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return [];
        const reminderOffsetMs = 15 * 60 * 1000;
        const delayMs = scheduledAt.getTime() - Date.now() - reminderOffsetMs;
        if (delayMs <= 0) return [];
        const participantIds = Array.isArray(payload.participantIds) ? (payload.participantIds as string[]).filter(Boolean) : [];
        const candidateName = String(payload.candidateName ?? 'A candidate');
        const jobTitle = String(payload.jobTitle ?? 'a job');
        return participantIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType: Subjects.INTERVIEW_SESSION_REMINDER,
            resourceType: 'interview-session',
            resourceId: envelope.resourceId,
            title: 'Upcoming interview',
            body: `Your interview with ${candidateName} (${jobTitle}) is in 15 minutes.`,
            link: this.interviewLink(organisationId),
            delayMs,
          }));
      }
      case Subjects.INTERVIEW_SCREENING_COMPLETED: {
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]).filter(Boolean) : [];
        const candidateName = String(payload.candidateName ?? 'A candidate');
        const jobTitle = String(payload.jobTitle ?? 'a job');
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'candidate-application',
            resourceId: envelope.resourceId,
            title: 'AI screening completed',
            body: `AI screening for ${candidateName} (${jobTitle}) is ready for review.`,
            link: this.interviewLink(organisationId),
          }));
      }
      case Subjects.INTERVIEW_EVALUATION_READY: {
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]).filter(Boolean) : [];
        const candidateName = String(payload.candidateName ?? 'A candidate');
        const jobTitle = String(payload.jobTitle ?? 'a job');
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'interview-evaluation',
            resourceId: envelope.resourceId,
            title: 'AI evaluation ready',
            body: `AI evaluation for ${candidateName} (${jobTitle}) is ready for review.`,
            link: this.interviewLink(organisationId),
          }));
      }
      case Subjects.HRMS_ONBOARDING_PENDING: {
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]).filter(Boolean) : [];
        if (!recipientIds.length) return [];
        const candidateName = String(payload.candidateName ?? 'A candidate');
        const jobTitle = payload.jobTitle ? ` for ${String(payload.jobTitle)}` : '';
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'onboarding-instance',
            resourceId: envelope.resourceId,
            title: 'New hire pending onboarding',
            body: `${candidateName} was hired${jobTitle} — convert them to an employee to start onboarding.`,
            link: this.hrmsLink(organisationId),
          }));
      }
      case Subjects.TICKET_CREATED: {
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]).filter(Boolean) : [];
        if (!recipientIds.length) return [];
        const subject = String(payload.subject ?? 'Support ticket');
        const roleName = String(payload.assigneeRoleName ?? 'your team');
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'ticket',
            resourceId: envelope.resourceId,
            title: 'New support ticket',
            body: `"${subject}" was assigned to ${roleName}.`,
            link: this.ticketLink(organisationId),
          }));
      }
      case Subjects.TICKET_STATUS_CHANGED: {
        const recipientIds = Array.isArray(payload.recipientIds) ? (payload.recipientIds as string[]).filter(Boolean) : [];
        if (!recipientIds.length) return [];
        const subject = String(payload.subject ?? 'Support ticket');
        const status = String(payload.status ?? 'updated');
        return recipientIds
          .filter((userId) => userId !== actorId)
          .map((userId) => ({
            organisationId,
            workspaceId,
            userId,
            actorId,
            eventId: envelope.eventId,
            eventType,
            resourceType: 'ticket',
            resourceId: envelope.resourceId,
            title: `Ticket ${status}`,
            body: `Your ticket "${subject}" was marked as ${status}.`,
            link: this.ticketLink(organisationId),
          }));
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

  private truncate(text: string, length: number): string {
    return text.length > length ? `${text.slice(0, length)}...` : text;
  }

  private messageLink(organisationId: string, channelId: string | undefined, messageId: string | undefined) {
    return `/organisations/${organisationId}/channels/${channelId ?? ''}/messages/${messageId ?? ''}`;
  }

  private channelLink(organisationId: string, channelId: string | undefined) {
    return `/organisations/${organisationId}/channels/${channelId ?? ''}`;
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

  private projectLink(organisationId: string, projectId: string | undefined) {
    return `/organisations/${organisationId}/projects/${projectId ?? ''}`;
  }

  private approvalLink(organisationId: string, approvalId: string | undefined) {
    return `/organisations/${organisationId}/approvals/${approvalId ?? ''}`;
  }

  private hrmsLink(organisationId: string) {
    return `/organisations/${organisationId}/hrms`;
  }

  private interviewLink(organisationId: string) {
    return `/organisations/${organisationId}/interview`;
  }

  private ticketLink(organisationId: string) {
    return `/organisations/${organisationId}/tickets`;
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
  ): Promise<ChannelFlags | null> {
    const preference = await tx.notificationPreference.findUnique({
      where: { organisationId_userId_eventType: { organisationId, userId, eventType } },
    });
    if (!preference) return null;
    return {
      inApp: preference.inApp,
      email: preference.email,
      desktop: preference.desktop,
      push: preference.push,
    };
  }

  private selectChannels(preference: ChannelFlags | null, eventType: string): ChannelFlags {
    if (eventType === Subjects.AI_SUMMARY_CONFIRMED) {
      return {
        inApp: preference?.inApp ?? true,
        email: preference?.email ?? true,
        desktop: preference?.desktop ?? true,
        push: preference?.push ?? false,
      };
    }
    return {
      inApp: preference?.inApp ?? true,
      email: preference?.email ?? false,
      desktop: preference?.desktop ?? true,
      push: preference?.push ?? false,
    };
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
