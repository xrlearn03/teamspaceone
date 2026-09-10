import { Injectable } from '@nestjs/common';
import { type EventEnvelope, Subjects } from '@teamspace-one/event-contracts';
import { type Prisma } from '#prisma';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AuthorizableUser } from '@teamspace-one/authorization';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;

export interface DocumentPermissions {
  visibility: 'public' | 'private' | 'direct' | 'channel' | 'project' | 'workspace';
  actorIds: string[];
  ownerId?: string;
  channelId?: string;
  channelType?: string;
  projectId?: string;
  assigneeId?: string;
  participantIds?: string[];
}

export interface SearchResult {
  id: string;
  resourceType: string;
  resourceId: string;
  title: string | null;
  content: string;
  organisationId: string;
  workspaceId: string | null;
  metadata: unknown;
  permissions: DocumentPermissions;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchOptions {
  resourceType?: string;
  resourceTypes?: string[];
  resourceId?: string;
  workspaceId?: string;
  authorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface SearchDocumentInput {
  resourceType: string;
  resourceId: string;
  workspaceId?: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  permissions: DocumentPermissions;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    const document = await this.extractDocument(tx, envelope);
    if (!document) {
      return;
    }

    const metadata = (document.metadata ?? {}) as Prisma.InputJsonValue;
    const permissions = document.permissions as unknown as Prisma.InputJsonValue;

    await tx.searchDocument.upsert({
      where: {
        organisationId_resourceType_resourceId: {
          organisationId: envelope.organisationId,
          resourceType: document.resourceType,
          resourceId: document.resourceId,
        },
      },
      create: {
        organisationId: envelope.organisationId,
        workspaceId: document.workspaceId ?? null,
        resourceType: document.resourceType,
        resourceId: document.resourceId,
        title: document.title ?? null,
        content: document.content,
        metadata,
        permissions,
      },
      update: {
        workspaceId: document.workspaceId ?? null,
        title: document.title ?? null,
        content: document.content,
        metadata,
        permissions,
      },
    });

    if (envelope.eventType === Subjects.CHANNEL_MEMBERS_UPDATED) {
      await this.updateChannelMessagePermissions(tx, envelope.organisationId, document.resourceId, document.permissions);
    }
    if (envelope.eventType === Subjects.PROJECT_UPDATED) {
      await this.updateProjectTaskPermissions(tx, envelope.organisationId, document.resourceId, document.permissions);
    }
  }

  async remove(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const resourceId = (payload.id ?? envelope.resourceId) as string;
    const resourceType = this.toResourceType(envelope.eventType);
    if (!resourceId || !resourceType) {
      return;
    }

    await tx.searchDocument.deleteMany({
      where: { resourceType, resourceId, organisationId: envelope.organisationId },
    });
    if (resourceType === 'project') {
      await tx.searchDocument.deleteMany({
        where: {
          organisationId: envelope.organisationId,
          resourceType: { in: ['task', 'project-comment', 'approval'] },
          permissions: { path: ['projectId'], equals: resourceId },
        },
      });
    }
    if (resourceType === 'channel') {
      await tx.searchDocument.deleteMany({
        where: {
          organisationId: envelope.organisationId,
          resourceType: 'message',
          permissions: { path: ['channelId'], equals: resourceId },
        },
      });
    }
  }

  async search(
    ctx: OrganisationContextValue,
    query: string,
    options?: SearchOptions,
    user?: AuthorizableUser,
  ): Promise<SearchResult[]> {
    const q = query.trim().slice(0, 500);
    if (!q) {
      return this.listPermitted(ctx, options, user);
    }

    const escaped = q.replace(/[%_]/g, '\\$&');
    const sqlParts = this.buildSearchSql(ctx, options, escaped, user);
    const rows = await this.prisma.$queryRawUnsafe<SearchResult[]>(sqlParts.sql, ...sqlParts.params);
    return rows ?? [];
  }

  async getByResource(
    ctx: OrganisationContextValue,
    resourceType: string,
    resourceId: string,
    user?: AuthorizableUser,
  ): Promise<SearchResult | null> {
    const builder = new SearchSqlBuilder(ctx, { resourceType, resourceId }, user);
    const sql = `
      SELECT "id", "resourceType", "resourceId", "title", "content", "metadata", "permissions", "organisationId", "workspaceId", "createdAt", "updatedAt"
      FROM "search_documents"
      WHERE ${builder.whereClause()}
      LIMIT 1
    `;
    const rows = await this.prisma.$queryRawUnsafe<SearchResult[]>(sql, ...builder.params);
    return rows?.[0] ?? null;
  }

  private async listPermitted(
    ctx: OrganisationContextValue,
    options?: SearchOptions,
    user?: AuthorizableUser,
  ): Promise<SearchResult[]> {
    const builder = new SearchSqlBuilder(ctx, options, user);
    const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.min(Math.max(options?.offset ?? 0, 0), MAX_OFFSET);
    builder.param(limit);
    builder.param(offset);

    const sql = `
      SELECT "id", "resourceType", "resourceId", "title", "content", "metadata", "permissions", "organisationId", "workspaceId", "createdAt", "updatedAt"
      FROM "search_documents"
      WHERE ${builder.whereClause()}
      ORDER BY "updatedAt" DESC
      LIMIT ${builder.ref(-2)} OFFSET ${builder.ref(-1)}
    `;
    const rows = await this.prisma.$queryRawUnsafe<SearchResult[]>(sql, ...builder.params);
    return rows ?? [];
  }

  private buildSearchSql(
    ctx: OrganisationContextValue,
    options: SearchOptions | undefined,
    escapedQuery: string,
    user?: AuthorizableUser,
  ): { sql: string; params: (string | number)[] } {
    const builder = new SearchSqlBuilder(ctx, options, user);
    const tsParam = builder.next();
    builder.param(escapedQuery);

    const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.min(Math.max(options?.offset ?? 0, 0), MAX_OFFSET);
    builder.param(limit);
    builder.param(offset);

    const sql = `
      SELECT "id", "resourceType", "resourceId", "title", "content", "metadata", "permissions", "organisationId", "workspaceId", "createdAt", "updatedAt"
      FROM "search_documents"
      WHERE ${builder.whereClause()}
        AND to_tsvector('english', "content") @@ plainto_tsquery('english', ${tsParam})
      ORDER BY "updatedAt" DESC
      LIMIT ${builder.ref(-2)} OFFSET ${builder.ref(-1)}
    `;

    return { sql, params: builder.params };
  }

  private async extractDocument(
    tx: Prisma.TransactionClient,
    envelope: EventEnvelope,
  ): Promise<SearchDocumentInput | null> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;

    switch (envelope.eventType) {
      case Subjects.MESSAGE_CREATED:
      case Subjects.MESSAGE_UPDATED:
        return this.extractMessageDocument(tx, payload, envelope);
      case Subjects.MESSAGE_DELETED:
        await this.remove(tx, envelope);
        return null;
      case Subjects.CHANNEL_CREATED:
      case Subjects.CHANNEL_UPDATED:
      case Subjects.CHANNEL_MEMBERS_UPDATED:
        return this.extractChannelDocument(tx, payload, envelope);
      case Subjects.TASK_CREATED:
      case Subjects.TASK_UPDATED:
      case Subjects.TASK_COMPLETED:
        if (payload.deleted === true) {
          await this.remove(tx, envelope);
          return null;
        }
        return this.extractTaskDocument(payload, envelope);
      case Subjects.PROJECT_CREATED:
      case Subjects.PROJECT_UPDATED:
        return this.extractProjectDocument(payload, envelope);
      case Subjects.PROJECT_COMMENT_CREATED:
      case Subjects.PROJECT_COMMENT_UPDATED:
        return this.extractProjectChildDocument(tx, payload, envelope, 'project-comment');
      case Subjects.PROJECT_COMMENT_DELETED:
        await this.remove(tx, envelope);
        return null;
      case Subjects.APPROVAL_CREATED:
      case Subjects.APPROVAL_APPROVED:
      case Subjects.APPROVAL_REJECTED:
        return this.extractProjectChildDocument(tx, payload, envelope, 'approval');
      case Subjects.FILE_UPLOADED:
      case Subjects.FILE_PROCESSED:
        return this.extractFileDocument(payload, envelope);
      case Subjects.FILE_DELETED:
        await this.remove(tx, envelope);
        return null;
      case Subjects.MEETING_CREATED:
      case Subjects.MEETING_STARTED:
      case Subjects.MEETING_ENDED:
      case Subjects.MEETING_PARTICIPANT_JOINED:
      case Subjects.VOICE_ROOM_CREATED:
        return this.extractMeetingDocument(tx, payload, envelope);
      case Subjects.MEETING_CHAT_CREATED:
        return this.extractMeetingChatDocument(tx, payload, envelope);
      case Subjects.MEETING_PARTICIPANT_LEFT:
        return null;
      case Subjects.AI_SUMMARY_COMPLETED:
        return this.extractAiSummaryDocument(payload, envelope);
      case Subjects.WORKSPACE_CREATED:
        return this.extractWorkspaceDocument(payload, envelope);
      case Subjects.ORGANISATION_CREATED:
        return this.extractOrganisationDocument(payload, envelope);
      case Subjects.USER_CREATED:
      case Subjects.USER_UPDATED:
        return this.extractUserDocument(tx, payload, envelope);
      case Subjects.HRMS_EMPLOYEE_CREATE:
        return this.extractEmployeeDocument(payload, envelope);
      case Subjects.INTERVIEW_SESSION_SCHEDULED:
        return this.extractInterviewSessionDocument(payload, envelope);
      case Subjects.INTERVIEW_SCREENING_COMPLETED:
      case Subjects.INTERVIEW_EVALUATION_READY:
        return this.extractCandidateDocument(payload, envelope);
      case Subjects.HRMS_LEAVE_REQUESTED:
      case Subjects.HRMS_LEAVE_APPROVED:
      case Subjects.HRMS_LEAVE_REJECTED:
      case Subjects.HRMS_ATTENDANCE_CORRECTION_REQUESTED:
      case Subjects.HRMS_ATTENDANCE_CORRECTION_RESOLVED:
        return this.extractHrmsDocument(payload, envelope);
      default:
        return null;
    }
  }

  private async extractMessageDocument(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): Promise<SearchDocumentInput> {
    const channelId = payload.channelId as string | undefined;
    const senderId = payload.senderId as string | undefined;
    let visibility: DocumentPermissions['visibility'] = 'channel';
    let actorIds: string[] = senderId ? [senderId] : [];
    let channelType: string | undefined;

    if (channelId) {
      const channelDoc = await tx.searchDocument.findFirst({
        where: { resourceType: 'channel', resourceId: channelId, organisationId: envelope.organisationId },
      });
      if (channelDoc && typeof channelDoc.permissions === 'object' && channelDoc.permissions !== null) {
        const perms = channelDoc.permissions as unknown as DocumentPermissions;
        visibility = perms.visibility === 'public' ? 'public' : 'channel';
        channelType = perms.channelType;
        actorIds = Array.from(new Set([...(perms.actorIds ?? []), ...actorIds]));
      }
    }

    return {
      resourceType: 'message',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      content: (payload.content as string) ?? '',
      metadata: {
        channelId,
        senderId,
        threadId: payload.threadId,
      },
      permissions: {
        visibility,
        actorIds,
        channelId,
        channelType,
      },
    };
  }

  private async extractChannelDocument(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): Promise<SearchDocumentInput> {
    const resourceId = (payload.id ?? envelope.resourceId) as string;
    const existing = await tx.searchDocument.findFirst({
      where: { resourceType: 'channel', resourceId, organisationId: envelope.organisationId },
    });
    const existingPermissions = existing?.permissions as unknown as DocumentPermissions | undefined;
    const members = Array.isArray(payload.members)
      ? payload.members.map((member) => (member as { userId?: unknown }).userId)
      : payload.memberIds;
    const hasMembers = Array.isArray(members);
    const memberIds = hasMembers ? members.filter((id): id is string => typeof id === 'string') : [];
    const channelType = (payload.type as string) ?? existingPermissions?.channelType ?? 'public';
    const createdBy = (payload.createdBy as string) ?? envelope.actorId ?? '';
    const actorIds = Array.from(new Set([...(hasMembers ? memberIds : existingPermissions?.actorIds ?? []), createdBy].filter(Boolean)));
    const title = (payload.name as string) ?? existing?.title ?? '';
    const content = payload.description === undefined && existing ? existing.content : `${title} ${payload.description ?? ''}`.trim();
    return {
      resourceType: 'channel',
      resourceId,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId ?? existing?.workspaceId ?? undefined,
      title,
      content,
      metadata: { type: channelType },
      permissions: {
        visibility: channelType === 'public' ? 'public' : channelType === 'direct' ? 'direct' : 'private',
        actorIds,
        channelType,
      },
    };
  }

  private extractTaskDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const title = (payload.title as string) ?? '';
    const description = (payload.description as string) ?? '';
    const assigneeId = (payload.assigneeId as string) ?? envelope.actorId ?? '';
    const actorId = envelope.actorId ?? '';
    const memberIds = Array.isArray(payload.memberIds)
      ? payload.memberIds.filter((id): id is string => typeof id === 'string')
      : [];
    const actorIds = [...memberIds, assigneeId, actorId].filter((id): id is string => typeof id === 'string' && id.length > 0);

    return {
      resourceType: 'task',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title,
      content: `${title} ${description}`.trim(),
      metadata: {
        projectId: payload.projectId,
        status: payload.status,
        completedAt: payload.completedAt,
      },
      permissions: {
        visibility: 'project',
        actorIds: Array.from(new Set(actorIds)),
        projectId: payload.projectId as string,
        assigneeId,
      },
    };
  }

  private extractProjectDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const name = (payload.name as string) ?? '';
    const description = (payload.description as string) ?? '';
    const ownerId = (payload.ownerId as string) ?? envelope.actorId ?? '';
    const memberIds = Array.isArray(payload.members)
      ? payload.members.map((member) => (member as { userId?: unknown }).userId).filter((id): id is string => typeof id === 'string')
      : Array.isArray(payload.memberIds)
        ? payload.memberIds.filter((id): id is string => typeof id === 'string')
        : [];

    return {
      resourceType: 'project',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title: name,
      content: `${name} ${description}`.trim(),
      metadata: { ownerId, status: payload.status },
      permissions: {
        visibility: 'project',
        actorIds: Array.from(new Set([...memberIds, ownerId].filter(Boolean))),
        ownerId,
      },
    };
  }

  private async extractProjectChildDocument(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
    resourceType: 'project-comment' | 'approval',
  ): Promise<SearchDocumentInput> {
    const resourceId = (payload.id ?? payload.approvalId ?? envelope.resourceId) as string;
    const existing = await tx.searchDocument.findFirst({
      where: { resourceType, resourceId, organisationId: envelope.organisationId },
    });
    const existingPermissions = existing?.permissions as unknown as DocumentPermissions | undefined;
    const projectId = (payload.projectId as string) ?? existingPermissions?.projectId;
    const memberIds = Array.isArray(payload.memberIds)
      ? payload.memberIds.filter((id): id is string => typeof id === 'string')
      : existingPermissions?.actorIds ?? [];
    const authorId = (payload.authorId as string) ?? (payload.requestedBy as string) ?? envelope.actorId ?? '';
    const status = payload.status ?? (envelope.eventType === Subjects.APPROVAL_APPROVED ? 'approved' : envelope.eventType === Subjects.APPROVAL_REJECTED ? 'rejected' : undefined);
    const content = resourceType === 'project-comment'
      ? String(payload.content ?? existing?.content ?? '')
      : [payload.message, payload.resourceType, status].filter(Boolean).join(' ') || existing?.content || 'Approval';
    return {
      resourceType,
      resourceId,
      workspaceId: envelope.workspaceId ?? existing?.workspaceId ?? undefined,
      title: resourceType === 'approval' ? `Approval: ${String(payload.resourceType ?? 'request')}` : undefined,
      content,
      metadata: { ...(existing?.metadata as Record<string, unknown> | null ?? {}), projectId, authorId, status },
      permissions: {
        visibility: 'project',
        actorIds: Array.from(new Set([...memberIds, authorId].filter(Boolean))),
        ownerId: authorId || undefined,
        projectId,
      },
    };
  }

  private extractFileDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const originalName = (payload.originalName as string) ?? (payload.name as string) ?? '';
    const metadata = (payload.metadata as Record<string, unknown>) ?? {};
    const textPreview = (metadata.textPreview as string) ?? '';
    const ownerId = (payload.ownerId as string) ?? (payload.uploaderId as string) ?? (payload.uploadedBy as string) ?? envelope.actorId ?? '';
    const visibility = (payload.visibility as string) ?? 'private';

    return {
      resourceType: 'file',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title: originalName,
      content: `${originalName} ${textPreview}`.trim(),
      metadata: { mimeType: payload.mimeType, storageKey: payload.storageKey, status: payload.status },
      permissions: {
        visibility: visibility === 'public' ? 'public' : 'private',
        actorIds: ownerId ? [ownerId] : [],
        ownerId,
      },
    };
  }

  private async extractMeetingDocument(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): Promise<SearchDocumentInput | null> {
    const resourceId = (payload.meetingId ?? payload.id ?? envelope.resourceId) as string;
    const existing = await tx.searchDocument.findFirst({
      where: { resourceType: { in: ['meeting', 'voice-room'] }, resourceId, organisationId: envelope.organisationId },
    });
    if (!existing && envelope.eventType === Subjects.MEETING_PARTICIPANT_JOINED) return null;

    const existingPermissions = existing?.permissions as unknown as DocumentPermissions | undefined;
    const existingMetadata = existing?.metadata as Record<string, unknown> | null;
    const eventParticipantIds = Array.isArray(payload.participantIds)
      ? payload.participantIds.filter((id): id is string => typeof id === 'string')
      : [];
    const joinedUserId = envelope.eventType === Subjects.MEETING_PARTICIPANT_JOINED && typeof payload.userId === 'string'
      ? payload.userId
      : undefined;
    const participantIds = Array.from(new Set([
      ...(existingPermissions?.participantIds ?? []),
      ...eventParticipantIds,
      ...(joinedUserId ? [joinedUserId] : []),
    ]));
    const title = (payload.title as string) ?? existing?.title ?? '';
    const createdBy = (payload.createdBy as string) ?? existingPermissions?.ownerId ?? envelope.actorId ?? '';
    const type = (payload.type as string) ?? (existingPermissions?.visibility === 'public' ? 'public' : 'private');
    const status = payload.status ?? (envelope.eventType === Subjects.MEETING_STARTED
      ? 'started'
      : envelope.eventType === Subjects.MEETING_ENDED
        ? 'ended'
        : undefined);

    return {
      resourceType: existing?.resourceType ?? (payload.type === 'voice_room' ? 'voice-room' : 'meeting'),
      resourceId,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId ?? existing?.workspaceId ?? undefined,
      title,
      content: payload.transcript ? `${title} ${payload.transcript}`.trim() : existing?.content ?? title,
      metadata: {
        ...(existingMetadata ?? {}),
        ...(status !== undefined ? { status } : {}),
        ...(payload.startedAt !== undefined ? { startedAt: payload.startedAt } : {}),
        ...(payload.endedAt !== undefined ? { endedAt: payload.endedAt } : {}),
      },
      permissions: {
        visibility: type === 'public' ? 'public' : 'private',
        actorIds: Array.from(new Set([createdBy, ...participantIds].filter(Boolean))),
        ownerId: createdBy || undefined,
        participantIds,
      },
    };
  }

  private async extractMeetingChatDocument(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): Promise<SearchDocumentInput | null> {
    const meetingId = payload.meetingId as string | undefined;
    if (!meetingId) return null;
    const meeting = await tx.searchDocument.findFirst({
      where: { resourceType: { in: ['meeting', 'voice-room'] }, resourceId: meetingId, organisationId: envelope.organisationId },
    });
    if (!meeting) return null;
    const permissions = meeting.permissions as unknown as DocumentPermissions;
    return {
      resourceType: 'meeting-chat',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: meeting.workspaceId ?? undefined,
      content: String(payload.content ?? ''),
      metadata: { meetingId, userId: payload.userId },
      permissions: { ...permissions },
    };
  }

  private extractInterviewSessionDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const participantIds = Array.isArray(payload.participantIds)
      ? payload.participantIds.filter((id): id is string => typeof id === 'string')
      : [];
    const organizerId = (payload.organizerId as string) ?? envelope.actorId ?? '';
    const title = `Interview: ${String(payload.candidateName ?? payload.jobTitle ?? 'Candidate')}`;
    return {
      resourceType: 'interview-session',
      resourceId: (payload.sessionId ?? envelope.resourceId) as string,
      title,
      content: `${title} ${payload.candidateEmail ?? ''} ${payload.jobTitle ?? ''}`.trim(),
      metadata: {
        candidateId: payload.candidateId,
        jobOpeningId: payload.jobOpeningId,
        scheduledAt: payload.scheduledAt,
        durationMin: payload.durationMin,
      },
      permissions: {
        visibility: 'private',
        actorIds: Array.from(new Set([organizerId, ...participantIds].filter(Boolean))),
        ownerId: organizerId || undefined,
        participantIds,
      },
    };
  }

  private extractHrmsDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const isLeave = envelope.eventType.includes('.leave.');
    const resourceType = isLeave ? 'hrms-leave' : 'hrms-attendance';
    const resourceId = (payload.id ?? payload.requestId ?? envelope.resourceId) as string;
    const ownerId = (payload.userId as string) ?? (payload.employeeId as string) ?? envelope.actorId ?? '';
    const managerId = (payload.managerUserId as string) ?? '';
    const status = payload.status ?? envelope.eventType.split('.').at(-1);
    const title = isLeave ? 'Leave request' : 'Attendance correction';
    return {
      resourceType,
      resourceId,
      title,
      content: [title, payload.reason, payload.startDate, payload.endDate, status].filter(Boolean).join(' '),
      metadata: { ...payload, status },
      permissions: {
        visibility: 'private',
        actorIds: Array.from(new Set([ownerId, managerId].filter(Boolean))),
        ownerId: ownerId || undefined,
      },
    };
  }

  private extractAiSummaryDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const actorId = envelope.actorId ?? '';
    const participantIds = Array.isArray(payload.participantIds)
      ? payload.participantIds.filter((id): id is string => typeof id === 'string')
      : [];
    const title = (payload.title as string) ?? 'AI Summary';
    return {
      resourceType: 'ai-summary',
      resourceId: (payload.id ?? payload.resourceId ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title,
      content: `${title} ${payload.summary ?? ''}`.trim(),
      metadata: { sourceId: payload.sourceId, sourceType: payload.sourceType },
      permissions: {
        visibility: 'workspace',
        actorIds: Array.from(new Set([actorId, ...participantIds].filter(Boolean))),
        ownerId: actorId || undefined,
        participantIds,
      },
    };
  }

  private extractWorkspaceDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const createdBy = (payload.createdBy as string) ?? envelope.actorId ?? '';
    return {
      resourceType: 'workspace',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      title: payload.name as string,
      content: `${payload.name ?? ''} ${payload.description ?? ''}`.trim(),
      metadata: { slug: payload.slug },
      permissions: {
        visibility: 'public',
        actorIds: createdBy ? [createdBy] : [],
      },
    };
  }

  private extractOrganisationDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const ownerId = (payload.ownerId as string) ?? (payload.createdBy as string) ?? envelope.actorId ?? '';
    return {
      resourceType: 'organisation',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      title: payload.name as string,
      content: `${payload.name ?? ''} ${payload.description ?? ''}`.trim(),
      metadata: { slug: payload.slug },
      permissions: {
        visibility: 'public',
        actorIds: ownerId ? [ownerId] : [],
        ownerId,
      },
    };
  }

  private async extractUserDocument(
    tx: Prisma.TransactionClient,
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): Promise<SearchDocumentInput> {
    const id = (payload.id ?? envelope.resourceId) as string;
    const existing = await tx.searchDocument.findFirst({
      where: { resourceType: 'user', resourceId: id, organisationId: envelope.organisationId },
    });
    const existingMetadata = existing?.metadata as Record<string, unknown> | null;
    const firstName = payload.firstName ?? existingMetadata?.firstName ?? '';
    const lastName = payload.lastName ?? existingMetadata?.lastName ?? '';
    const email = payload.email ?? existingMetadata?.email;
    const fullName = `${firstName} ${lastName}`.trim();
    const title = fullName || (payload.name as string) || existing?.title || (email as string) || '';
    return {
      resourceType: 'user',
      resourceId: id,
      title,
      content: [title, payload.displayName, email].filter((value) => typeof value === 'string' && value.length > 0).join(' '),
      metadata: {
        ...(existingMetadata ?? {}),
        firstName,
        lastName,
        email,
        ...(payload.avatarFileId !== undefined ? { avatarFileId: payload.avatarFileId } : {}),
      },
      permissions: {
        visibility: 'public',
        actorIds: id ? [id] : [],
        ownerId: id,
      },
    };
  }

  private extractEmployeeDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const userId = (payload.userId ?? envelope.resourceId) as string;
    const firstName = String(payload.firstName ?? '');
    const lastName = String(payload.lastName ?? '');
    const fullName = `${firstName} ${lastName}`.trim();
    return {
      resourceType: 'employee',
      resourceId: userId,
      title: fullName || (payload.workEmail as string) || '',
      content: `${fullName} ${payload.workEmail ?? ''}`.trim(),
      metadata: { membershipId: payload.membershipId, workEmail: payload.workEmail, firstName, lastName },
      permissions: {
        visibility: 'workspace',
        actorIds: [],
        ownerId: userId,
      },
    };
  }

  private extractCandidateDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const candidateId = (payload.candidateId ?? envelope.resourceId) as string;
    const candidateName = String(payload.candidateName ?? '');
    const candidateEmail = String(payload.candidateEmail ?? '');
    return {
      resourceType: 'candidate',
      resourceId: candidateId,
      title: candidateName || candidateEmail || '',
      content: `${candidateName} ${candidateEmail}`.trim(),
      metadata: { jobOpeningId: payload.jobOpeningId, jobTitle: payload.jobTitle, candidateEmail },
      permissions: {
        visibility: 'workspace',
        actorIds: [],
        ownerId: candidateId,
      },
    };
  }

  private async updateChannelMessagePermissions(
    tx: Prisma.TransactionClient,
    organisationId: string,
    channelId: string,
    permissions: DocumentPermissions,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE "search_documents"
       SET "permissions" = jsonb_set(
         jsonb_set("permissions", '{actorIds}', $1::jsonb, true),
         '{channelType}', to_jsonb($2::text), true
       )
       WHERE "organisationId" = $3
         AND "resourceType" = 'message'
         AND "permissions"->>'channelId' = $4`,
      JSON.stringify(permissions.actorIds),
      permissions.channelType ?? 'private',
      organisationId,
      channelId,
    );
  }

  private async updateProjectTaskPermissions(
    tx: Prisma.TransactionClient,
    organisationId: string,
    projectId: string,
    permissions: DocumentPermissions,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `UPDATE "search_documents"
       SET "permissions" = jsonb_set("permissions", '{actorIds}', $1::jsonb, true)
       WHERE "organisationId" = $2
         AND "resourceType" = 'task'
         AND "permissions"->>'projectId' = $3`,
      JSON.stringify(permissions.actorIds),
      organisationId,
      projectId,
    );
  }

  private toResourceType(eventType: string): string | null {
    if (eventType.startsWith('teamspace-one.message')) return 'message';
    if (eventType.startsWith('teamspace-one.channel')) return 'channel';
    if (eventType.startsWith('teamspace-one.task')) return 'task';
    if (eventType.startsWith('teamspace-one.project.comment')) return 'project-comment';
    if (eventType.startsWith('teamspace-one.project')) return 'project';
    if (eventType.startsWith('teamspace-one.file')) return 'file';
    if (eventType.startsWith('teamspace-one.meeting')) return 'meeting';
    if (eventType.startsWith('teamspace-one.ai')) return 'ai-summary';
    if (eventType === Subjects.WORKSPACE_CREATED) return 'workspace';
    if (eventType.startsWith('teamspace-one.organisation')) return 'organisation';
    if (eventType.startsWith('teamspace-one.user')) return 'user';
    return null;
  }
}

class SearchSqlBuilder {
  private conditions: string[] = [];
  private _params: (string | number)[] = [];
  private _next = 1;

  constructor(
    ctx: OrganisationContextValue,
    options?: SearchOptions,
    private readonly user?: AuthorizableUser,
  ) {
    this.where('"organisationId" = $?', ctx.organisationId);
    if (options?.resourceTypes?.length) this.whereIn('"resourceType"', options.resourceTypes);
    else if (options?.resourceType) this.where('"resourceType" = $?', options.resourceType);
    if (options?.workspaceId) this.where('"workspaceId" = $?', options.workspaceId);
    if (options?.resourceId) this.where('"resourceId" = $?', options.resourceId);
    if (options?.authorId) {
      this.where(
        `COALESCE("metadata"->>'senderId', "metadata"->>'authorId', "permissions"->>'ownerId', "permissions"->>'assigneeId') = $?`,
        options.authorId,
      );
    }
    if (options?.from) this.where('"createdAt" >= $?::timestamptz', options.from);
    if (options?.to) this.where('"createdAt" <= $?::timestamptz', options.to);
    this.addPermissionFilter(ctx.actorId ?? '');
  }

  where(template: string, value: string | number): void {
    const placeholder = `$${this._next}`;
    this.conditions.push(template.replace('$?', placeholder));
    this._params.push(value);
    this._next++;
  }

  whereIn(column: string, values: string[]): void {
    const refs = values.map(() => `$${this._next++}`);
    this.conditions.push(`${column} IN (${refs.join(', ')})`);
    this._params.push(...values);
  }

  addPermissionFilter(actorId: string): void {
    if (!actorId) {
      this.conditions.push(`("permissions"->>'visibility')::text = 'public'`);
      return;
    }

    if (this.user?.isSuperAdmin) {
      return;
    }

    const start = this._next;
    const visibility = `$${start}`;
    const actor = `$${start + 1}`;
    const owner = `$${start + 2}`;
    const assignee = `$${start + 3}`;
    const participant = `$${start + 4}`;
    this._params.push('public', actorId, actorId, actorId, actorId);
    this._next += 5;

    const accessConditions = [
      `("permissions"->>'visibility' = ${visibility} OR ("permissions"->>'visibility' = 'workspace' AND "resourceType" NOT IN ('employee', 'candidate')))`,
      `"permissions"->'actorIds' ? ${actor}`,
      `"permissions"->>'ownerId' = ${owner}`,
      `"permissions"->>'assigneeId' = ${assignee}`,
      `"permissions"->'participantIds' ? ${participant}`,
    ];
    const scopedResourceTypes = this.scopedResourceTypes();
    if (scopedResourceTypes.length) {
      const resourceTypes = scopedResourceTypes.map(() => `$${this._next++}`);
      accessConditions.push(
        `("resourceType" IN (${resourceTypes.join(', ')}) AND "permissions"->>'visibility' NOT IN ('private', 'direct'))`,
      );
      this._params.push(...scopedResourceTypes);
    }
    this.conditions.push(`(${accessConditions.join(' OR ')})`);
  }

  private scopedResourceTypes(): string[] {
    if (!this.user?.dataScopes?.length) return [];
    const modules = new Set<string>();
    for (const scope of this.user.dataScopes) {
      if (scope.scope === 'organisation') modules.add(scope.module);
    }
    const map: Record<string, string[]> = {
      collaboration: ['channel', 'message', 'project', 'task', 'project-comment', 'approval', 'meeting', 'voice-room', 'meeting-chat', 'file'],
      hrms: ['employee', 'hrms-leave', 'hrms-attendance'],
      interview: ['candidate', 'interview-session'],
      user: ['user'],
    };
    const types: string[] = [];
    for (const mod of modules) {
      if (mod === '*') {
        return Object.values(map).flat();
      }
      types.push(...(map[mod] ?? []));
    }
    return Array.from(new Set(types));
  }

  next(): string {
    return `$${this._next++}`;
  }

  param(value: string | number): void {
    this._params.push(value);
  }

  ref(offset: number): string {
    const index = this._params.length + offset + 1;
    return `$${index}`;
  }

  get params(): (string | number)[] {
    return this._params;
  }

  whereClause(): string {
    return this.conditions.join(' AND ');
  }
}
