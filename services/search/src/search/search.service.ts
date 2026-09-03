import { Injectable } from '@nestjs/common';
import { type EventEnvelope, Subjects } from '@reactify/event-contracts';
import { type Prisma } from '#prisma';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { PrismaService } from '../prisma/prisma.service.js';

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
  }

  async search(
    ctx: OrganisationContextValue,
    query: string,
    options?: { resourceType?: string; workspaceId?: string; limit?: number; offset?: number },
  ): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) {
      return this.listPermitted(ctx, options);
    }

    const escaped = q.replace(/[%_]/g, '\\$&');
    const sqlParts = this.buildSearchSql(ctx, options, escaped);
    const rows = await this.prisma.$queryRawUnsafe<SearchResult[]>(sqlParts.sql, ...sqlParts.params);
    return rows ?? [];
  }

  async getByResource(
    ctx: OrganisationContextValue,
    resourceType: string,
    resourceId: string,
  ): Promise<SearchResult | null> {
    const builder = new SearchSqlBuilder(ctx, { resourceType, resourceId });
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
    options?: { resourceType?: string; workspaceId?: string; limit?: number; offset?: number },
  ): Promise<SearchResult[]> {
    const builder = new SearchSqlBuilder(ctx, options);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
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
    options: { resourceType?: string; workspaceId?: string; limit?: number; offset?: number } | undefined,
    escapedQuery: string,
  ): { sql: string; params: (string | number)[] } {
    const builder = new SearchSqlBuilder(ctx, options);
    const tsParam = builder.next();
    builder.param(escapedQuery);

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
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
        return this.extractChannelDocument(payload, envelope);
      case Subjects.TASK_CREATED:
      case Subjects.TASK_UPDATED:
      case Subjects.TASK_COMPLETED:
        return this.extractTaskDocument(payload, envelope);
      case Subjects.PROJECT_CREATED:
        return this.extractProjectDocument(payload, envelope);
      case Subjects.FILE_UPLOADED:
      case Subjects.FILE_PROCESSED:
        return this.extractFileDocument(payload, envelope);
      case Subjects.FILE_DELETED:
        await this.remove(tx, envelope);
        return null;
      case Subjects.MEETING_CREATED:
      case Subjects.MEETING_STARTED:
      case Subjects.MEETING_ENDED:
        return this.extractMeetingDocument(payload, envelope);
      case Subjects.AI_SUMMARY_COMPLETED:
        return this.extractAiSummaryDocument(payload, envelope);
      case Subjects.WORKSPACE_CREATED:
        return this.extractWorkspaceDocument(payload, envelope);
      case Subjects.ORGANISATION_CREATED:
        return this.extractOrganisationDocument(payload, envelope);
      case Subjects.USER_CREATED:
      case Subjects.USER_UPDATED:
        return this.extractUserDocument(payload, envelope);
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

  private extractChannelDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const channelType = (payload.type as string) ?? 'public';
    const createdBy = (payload.createdBy as string) ?? envelope.actorId ?? '';
    return {
      resourceType: 'channel',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title: payload.name as string,
      content: `${payload.name ?? ''} ${payload.description ?? ''}`.trim(),
      metadata: { type: channelType },
      permissions: {
        visibility: channelType === 'public' ? 'public' : 'private',
        actorIds: createdBy ? [createdBy] : [],
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
    const actorIds = [assigneeId, actorId].filter((id): id is string => typeof id === 'string' && id.length > 0);

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

    return {
      resourceType: 'project',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title: name,
      content: `${name} ${description}`.trim(),
      metadata: { ownerId, status: payload.status },
      permissions: {
        visibility: 'public',
        actorIds: ownerId ? [ownerId] : [],
        ownerId,
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
    const ownerId = (payload.ownerId as string) ?? (payload.uploadedBy as string) ?? envelope.actorId ?? '';
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

  private extractMeetingDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const title = (payload.title as string) ?? '';
    const createdBy = (payload.createdBy as string) ?? envelope.actorId ?? '';
    const participantIds = Array.isArray(payload.participantIds) ? (payload.participantIds as string[]) : [];
    const type = (payload.type as string) ?? 'private';
    const actorIds = Array.from(new Set([createdBy, ...participantIds]));

    return {
      resourceType: 'meeting',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title,
      content: title,
      metadata: { status: payload.status, startedAt: payload.startedAt, endedAt: payload.endedAt },
      permissions: {
        visibility: type === 'public' ? 'public' : 'private',
        actorIds,
        participantIds,
      },
    };
  }

  private extractAiSummaryDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const actorId = envelope.actorId ?? '';
    return {
      resourceType: 'ai-summary',
      resourceId: (payload.id ?? envelope.resourceId) as string,
      workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
      title: 'AI Summary',
      content: (payload.summary as string) ?? '',
      metadata: { sourceId: payload.sourceId, sourceType: payload.sourceType },
      permissions: {
        visibility: 'workspace',
        actorIds: actorId ? [actorId] : [],
        ownerId: actorId,
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

  private extractUserDocument(
    payload: Record<string, unknown>,
    envelope: EventEnvelope,
  ): SearchDocumentInput {
    const id = (payload.id ?? envelope.resourceId) as string;
    return {
      resourceType: 'user',
      resourceId: id,
      title: (payload.name as string) ?? (payload.email as string) ?? '',
      content: `${payload.name ?? ''} ${payload.displayName ?? ''} ${payload.email ?? ''}`.trim(),
      metadata: { email: payload.email, avatarUrl: payload.avatarUrl },
      permissions: {
        visibility: 'public',
        actorIds: id ? [id] : [],
        ownerId: id,
      },
    };
  }

  private toResourceType(eventType: string): string | null {
    if (eventType.startsWith('reactify.message')) return 'message';
    if (eventType.startsWith('reactify.channel')) return 'channel';
    if (eventType.startsWith('reactify.task')) return 'task';
    if (eventType.startsWith('reactify.project')) return 'project';
    if (eventType.startsWith('reactify.file')) return 'file';
    if (eventType.startsWith('reactify.meeting')) return 'meeting';
    if (eventType.startsWith('reactify.ai')) return 'ai-summary';
    if (eventType === Subjects.WORKSPACE_CREATED) return 'workspace';
    if (eventType.startsWith('reactify.organisation')) return 'organisation';
    if (eventType.startsWith('reactify.user')) return 'user';
    return null;
  }
}

class SearchSqlBuilder {
  private conditions: string[] = [];
  private _params: (string | number)[] = [];
  private _next = 1;

  constructor(
    ctx: OrganisationContextValue,
    options?: { resourceType?: string; workspaceId?: string; resourceId?: string },
  ) {
    this.where('"organisationId" = $?', ctx.organisationId);
    if (options?.resourceType) this.where('"resourceType" = $?', options.resourceType);
    if (options?.workspaceId) this.where('"workspaceId" = $?', options.workspaceId);
    if (options?.resourceId) this.where('"resourceId" = $?', options.resourceId);
    this.addPermissionFilter(ctx.actorId ?? '');
  }

  where(template: string, value: string | number): void {
    const placeholder = `$${this._next}`;
    this.conditions.push(template.replace('$?', placeholder));
    this._params.push(value);
    this._next++;
  }

  addPermissionFilter(actorId: string): void {
    if (!actorId) {
      this.conditions.push(`("permissions"->>'visibility')::text = 'public'`);
      return;
    }
    const start = this._next;
    const visibility = `$${start}`;
    const actor = `$${start + 1}`;
    const owner = `$${start + 2}`;
    const assignee = `$${start + 3}`;
    this.conditions.push(
      `("permissions"->>'visibility' = ${visibility} OR "permissions"->'actorIds' ? ${actor} OR "permissions"->>'ownerId' = ${owner} OR "permissions"->>'assigneeId' = ${assignee})`,
    );
    this._params.push('public', actorId, actorId, actorId);
    this._next += 4;
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
