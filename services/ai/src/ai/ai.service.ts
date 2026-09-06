import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { createEventEnvelope, Subjects, type EventEnvelope } from '@teamspace-one/event-contracts';
import { type OrganisationContextValue } from '@teamspace-one/organisation-context';

interface IndexDocumentInput {
  organisationId: string;
  workspaceId?: string;
  resourceType: string;
  resourceId: string;
  title?: string | null;
  text: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue('ai-ingestion') private readonly aiQueue: Queue,
  ) {}

  async summarize(prompt: string, sourceText?: string, options?: { system?: string }): Promise<{ result: string; model: string }> {
    const client = await this.getClient();
    const model = this.config.get<string>('AI_MODEL') ?? this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    if (!client) {
      return {
        result: `No AI provider configured. Placeholder summary for: ${prompt}`,
        model: 'none',
      };
    }

    const content = sourceText ? `${prompt}\n\n${sourceText.slice(0, 12000)}` : prompt;

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: options?.system ?? 'You are a helpful assistant that summarizes text.' },
          { role: 'user', content },
        ],
      });
      const result = completion.choices[0]?.message?.content ?? '';
      return { result, model };
    } catch (err) {
      this.logger.error(`AI summarization call failed: ${(err as Error).message}`);
      return { result: 'AI summarization failed.', model: 'none' };
    }
  }

  async embed(text: string): Promise<number[]> {
    const client = await this.getClient();
    const input = text.slice(0, 8000).trim();

    if (!client || !input) {
      return Array(1536).fill(0);
    }

    const model = this.config.get<string>('AI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';

    try {
      const response = await client.embeddings.create({
        model,
        input,
        encoding_format: 'float',
      });
      return response.data[0]?.embedding ?? Array(1536).fill(0);
    } catch (err) {
      this.logger.error(`Embedding failed: ${(err as Error).message}`);
      return Array(1536).fill(0);
    }
  }

  async handleEvent(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;

    switch (envelope.eventType) {
      case Subjects.MESSAGE_CREATED:
      case Subjects.MESSAGE_UPDATED: {
        const text = (payload.content as string) ?? '';
        if (!text) return;
        const senderId = (payload.senderId as string) ?? envelope.actorId;
        await this.indexDocument(tx, {
          organisationId: envelope.organisationId,
          workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
          resourceType: 'message',
          resourceId: (payload.id ?? envelope.resourceId) as string,
          text,
          metadata: {
            channelId: payload.channelId,
            senderId,
            workspaceId: payload.workspaceId ?? envelope.workspaceId,
            visibility: 'channel',
            actorIds: [senderId].filter((id): id is string => typeof id === 'string' && id.length > 0),
          },
        });
        return;
      }
      case Subjects.MESSAGE_DELETED: {
        await this.deleteDocument(tx, {
          organisationId: envelope.organisationId,
          resourceType: 'message',
          resourceId: (payload.id ?? envelope.resourceId) as string,
        });
        return;
      }
      case Subjects.TASK_CREATED:
      case Subjects.TASK_UPDATED:
      case Subjects.TASK_COMPLETED: {
        const title = (payload.title as string) ?? '';
        const description = (payload.description as string) ?? '';
        const text = `${title} ${description}`.trim();
        if (!text) return;
        const assigneeId = (payload.assigneeId as string) ?? '';
        const actorId = envelope.actorId ?? '';
        await this.indexDocument(tx, {
          organisationId: envelope.organisationId,
          workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
          resourceType: 'task',
          resourceId: (payload.id ?? envelope.resourceId) as string,
          title,
          text,
          metadata: {
            projectId: payload.projectId,
            assigneeId,
            workspaceId: payload.workspaceId ?? envelope.workspaceId,
            visibility: 'project',
            actorIds: Array.from(new Set([assigneeId, actorId].filter((id): id is string => typeof id === 'string' && id.length > 0))),
          },
        });
        return;
      }
      case Subjects.FILE_PROCESSED: {
        const metadata = (payload.metadata as Record<string, unknown>) ?? {};
        const textPreview = (metadata.textPreview as string) ?? '';
        const originalName = (payload.originalName as string) ?? '';
        const text = `${originalName} ${textPreview}`.trim();
        if (!text) return;
        const uploaderId = (payload.uploaderId as string) ?? envelope.actorId;
        await this.indexDocument(tx, {
          organisationId: envelope.organisationId,
          workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
          resourceType: 'file',
          resourceId: (payload.id ?? envelope.resourceId) as string,
          title: originalName,
          text,
          metadata: {
            mimeType: payload.mimeType,
            storageKey: payload.storageKey,
            workspaceId: payload.workspaceId ?? envelope.workspaceId,
            visibility: 'private',
            actorIds: [uploaderId].filter((id): id is string => typeof id === 'string' && id.length > 0),
          },
        });
        return;
      }
      case Subjects.FILE_DELETED: {
        await this.deleteDocument(tx, {
          organisationId: envelope.organisationId,
          resourceType: 'file',
          resourceId: (payload.id ?? envelope.resourceId) as string,
        });
        return;
      }
      case Subjects.MEETING_ENDED: {
        const title = (payload.title as string) ?? '';
        const transcript = (payload.transcript as string) ?? '';
        const text = `${title}\n${transcript}`.trim();
        const createdBy = (payload.createdBy as string) ?? envelope.actorId;
        const participantIds = Array.isArray(payload.participantIds) ? (payload.participantIds as string[]) : [];
        const resourceId = (payload.id ?? envelope.resourceId) as string;
        await this.indexDocument(tx, {
          organisationId: envelope.organisationId,
          workspaceId: (payload.workspaceId as string) ?? envelope.workspaceId,
          resourceType: 'meeting',
          resourceId,
          title,
          text: text || title,
          metadata: {
            workspaceId: payload.workspaceId ?? envelope.workspaceId,
            visibility: 'private',
            createdBy,
            actorIds: Array.from(new Set([createdBy, ...participantIds].filter((id): id is string => typeof id === 'string' && id.length > 0))),
          },
        });

        await tx.aiSummary.upsert({
          where: { resourceType_resourceId: { resourceType: 'meeting', resourceId } },
          create: {
            organisationId: envelope.organisationId,
            resourceType: 'meeting',
            resourceId,
            prompt: `Summarize the following meeting context for meeting ${resourceId}.`,
            result: '',
            model: 'pending',
          },
          update: { result: '', model: 'pending' },
        });
        return;
      }
      default:
        return;
    }
  }

  async ingest(envelope: EventEnvelope): Promise<void> {
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const resourceId = (payload.id ?? envelope.resourceId) as string | undefined;
    if (!resourceId) return;

    const workspaceId = (payload.workspaceId as string) ?? envelope.workspaceId;
    const jobs: Promise<unknown>[] = [];
    const resourceType = this.toResourceType(envelope.eventType);

    if (resourceType) {
      jobs.push(
        this.aiQueue.add(
          'index',
          { organisationId: envelope.organisationId, workspaceId, resourceType, resourceId },
          { jobId: `index-${envelope.eventId}` },
        ),
      );
    }

    if (envelope.eventType === Subjects.MEETING_ENDED) {
      jobs.push(
        this.aiQueue.add(
          'summarize',
          { organisationId: envelope.organisationId, workspaceId, resourceType: 'meeting', resourceId },
          { jobId: `summarize-${envelope.eventId}` },
        ),
      );
    }

    if (jobs.length > 0) {
      await Promise.all(jobs);
      this.logger.log({ eventId: envelope.eventId, resourceType }, 'Enqueued AI ingestion jobs');
    }
  }

  async processIndexJob(data: { organisationId: string; resourceType: string; resourceId: string }): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; text: string }>>`
      SELECT "id", "text" FROM "ai_documents"
      WHERE "organisationId" = ${data.organisationId}
        AND "resourceType" = ${data.resourceType}
        AND "resourceId" = ${data.resourceId}
      LIMIT 1
    `;

    if (!rows.length) {
      this.logger.warn({ ...data }, 'AiDocument not found for indexing');
      return;
    }

    const { id, text } = rows[0];
    if (!text) {
      this.logger.warn({ id }, 'Empty document, skipping embedding');
      return;
    }

    const vector = await this.embed(text);
    const vectorString = '[' + vector.map((v) => v.toFixed(8)).join(',') + ']';

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`
        UPDATE "ai_documents"
        SET "vector" = ${vectorString}::vector, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
      `;

      const docs = await tx.$queryRaw<
        Array<{
          organisationId: string;
          workspaceId: string | null;
          resourceType: string;
          resourceId: string;
          title: string | null;
          text: string;
          metadata: unknown;
        }>
      >`
        SELECT "organisationId", "workspaceId", "resourceType", "resourceId", "title", "text", "metadata"
        FROM "ai_documents"
        WHERE "id" = ${id}
        LIMIT 1
      `;

      if (docs.length) {
        const doc = docs[0];
        const outbox = createEventEnvelope({
          eventType: Subjects.AI_DOCUMENT_INDEXED,
          eventVersion: 1,
          organisationId: doc.organisationId,
          workspaceId: doc.workspaceId ?? undefined,
          resourceType: 'ai_document',
          resourceId: id,
          correlationId: randomUUID(),
          payload: {
            resourceType: doc.resourceType,
            resourceId: doc.resourceId,
            title: doc.title,
            text: doc.text,
            workspaceId: doc.workspaceId,
            metadata: doc.metadata,
          },
        });
        await this.outbox.createEvent(tx, outbox, Subjects.AI_DOCUMENT_INDEXED);
      }
    });
  }

  async processSummarizeJob(data: { organisationId: string; resourceType: string; resourceId: string }): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; text: string; title: string | null; workspaceId: string | null; metadata: Record<string, unknown> }>
    >`
      SELECT "id", "text", "title", "workspaceId", "metadata" FROM "ai_documents"
      WHERE "organisationId" = ${data.organisationId}
        AND "resourceType" = ${data.resourceType}
        AND "resourceId" = ${data.resourceId}
      LIMIT 1
    `;

    const doc = rows[0];
    const text = doc?.text ?? '';
    const prompt = `Draft a professional Minutes of Meeting (MOM) email body for the following meeting. Use this structure and include bracketed placeholders like [Meeting Date] for any missing details:

Dear Team,

Please find below the Minutes of Meeting (MOM) for the meeting titled "${doc?.title ?? '[Meeting Title]'}".

Meeting Details
- Project: [Project Name]
- Date: [Meeting Date]
- Time: [Meeting Time]
- Attendees: [Names]
- Meeting Objective: [Objective]

Key Discussion Points
1. ...
2. ...

Decisions Taken
- ...

Action Items
1. [Action item description] | Responsible: [Name] | Status: Pending
2. ...

Next Steps
- ...

Please review the above MOM and share any corrections or additional points.

Best regards,
[Your Name]

Do not include the meeting ID or a generic opening such as "The meeting with ID ... is a development video call." in the body text. Recipients are already participants. Use the meeting context below to fill the sections above:

`
    const { result, model } = await this.summarize(prompt, text, { system: 'You are an executive assistant that drafts professional Minutes of Meeting (MOM) emails.' });

    const metadata = doc?.metadata ?? {};
    const participantIds = Array.isArray(metadata.actorIds) ? (metadata.actorIds as string[]) : [];
    const createdBy = (metadata.createdBy as string) ?? 'unknown';

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.aiSummary.upsert({
        where: { resourceType_resourceId: { resourceType: data.resourceType, resourceId: data.resourceId } },
        create: {
          organisationId: data.organisationId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          prompt,
          result,
          model,
        },
        update: { result, model },
      });

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_SUMMARY_COMPLETED,
        eventVersion: 1,
        organisationId: data.organisationId,
        workspaceId: doc?.workspaceId ?? undefined,
        resourceType: 'ai_summary',
        resourceId: data.resourceId,
        correlationId: randomUUID(),
        payload: {
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          title: doc?.title ?? undefined,
          summary: result,
          model,
          participantIds,
          sourceType: data.resourceType,
          sourceId: data.resourceId,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_SUMMARY_COMPLETED);

      await tx.aiActionConfirmation.create({
        data: {
          organisationId: data.organisationId,
          workspaceId: doc?.workspaceId ?? null,
          actorId: createdBy,
          actionType: 'send_meeting_summary_email',
          payload: {
            resourceType: data.resourceType,
            resourceId: data.resourceId,
            title: doc?.title ?? undefined,
            summary: result,
            participantIds,
            workspaceId: doc?.workspaceId ?? undefined,
          } as any,
          status: 'pending',
        },
      });

      const requestOutbox = createEventEnvelope({
        eventType: Subjects.AI_ACTION_REQUESTED,
        eventVersion: 1,
        organisationId: data.organisationId,
        workspaceId: doc?.workspaceId ?? undefined,
        actorId: createdBy,
        resourceType: 'ai_action_confirmation',
        resourceId: data.resourceId,
        correlationId: randomUUID(),
        payload: {
          actionType: 'send_meeting_summary_email',
          resourceType: data.resourceType,
          resourceId: data.resourceId,
        },
      });
      await this.outbox.createEvent(tx, requestOutbox, Subjects.AI_ACTION_REQUESTED);
    });
  }

  async ask(
    ctx: OrganisationContextValue,
    question: string,
    options: { workspaceId?: string; resourceTypes?: string[]; limit?: number } = {},
  ): Promise<{ answer: string; sources: Array<{ resourceType: string; resourceId: string; title: string | null; text: string }> }> {
    const vector = await this.embed(question);
    const vectorString = '[' + vector.map((v) => v.toFixed(8)).join(',') + ']';
    const workspaceId = options.workspaceId ?? ctx.workspaceId ?? null;
    const limit = options.limit ?? 50;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        resourceType: string;
        resourceId: string;
        title: string | null;
        text: string;
        metadata: Record<string, unknown>;
      }>
    >`
      SELECT "id", "resourceType", "resourceId", "title", "text", "metadata"
      FROM "ai_documents"
      WHERE "organisationId" = ${ctx.organisationId}
        AND "vector" IS NOT NULL
        AND ( ${workspaceId}::text IS NULL OR "workspaceId" = ${workspaceId}::text )
      ORDER BY "vector" <-> ${vectorString}::vector
      LIMIT ${limit}
    `;

    const resourceTypes = new Set(options.resourceTypes ?? []);
    const filtered = (rows ?? []).filter((row) => {
      if (resourceTypes.size && !resourceTypes.has(row.resourceType)) return false;
      const visibility = row.metadata?.visibility as string | undefined;
      const actorIds = row.metadata?.actorIds as string[] | undefined;
      if (visibility === 'public') return true;
      if (!ctx.actorId) return false;
      if (Array.isArray(actorIds) && actorIds.includes(ctx.actorId)) return true;
      return false;
    });

    const sources = filtered.slice(0, 5).map((s) => ({
      resourceType: s.resourceType,
      resourceId: s.resourceId,
      title: s.title,
      text: s.text,
    }));

    const context = sources.map((s) => `[${s.resourceType}:${s.resourceId}] ${s.title ? s.title + '\n' : ''}${s.text}`).join('\n\n');
    const client = await this.getClient();
    const model = this.config.get<string>('AI_MODEL') ?? this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    let answer = 'No AI provider configured. No answer could be generated.';

    if (client) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant. Use only the provided context. Cite sources with [resourceType:resourceId].',
            },
            {
              role: 'user',
              content: `Context:\n${context}\n\nQuestion: ${question}`,
            },
          ],
        });
        answer = completion.choices[0]?.message?.content ?? answer;
      } catch (err) {
        this.logger.error(`Q&A failed: ${(err as Error).message}`);
      }
    }

    const resultWorkspaceId = options.workspaceId ?? ctx.workspaceId;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rec = await tx.aiQuestion.create({
        data: {
          organisationId: ctx.organisationId,
          workspaceId: resultWorkspaceId ?? null,
          actorId: ctx.actorId ?? 'unknown',
          question,
          context: sources as any,
          answer,
          model: client ? model : 'none',
        },
      });

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_QUESTION_ANSWERED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: resultWorkspaceId,
        actorId: ctx.actorId,
        resourceType: 'ai_question',
        resourceId: rec.id,
        correlationId: ctx.correlationId,
        payload: {
          id: rec.id,
          question,
          answer,
          sources,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_QUESTION_ANSWERED);
    });

    return { answer, sources };
  }

  async dailyDigest(
    ctx: OrganisationContextValue,
    workspaceId?: string,
    hours = 24,
  ): Promise<{ sections: { title: string; items: string[] }[]; model: string; raw: string }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const rows = await this.prisma.$queryRaw<
      Array<{ resourceType: string; resourceId: string; title: string | null; text: string; updatedAt: Date }>
    >`
      SELECT "resourceType", "resourceId", "title", "text", "updatedAt"
      FROM "ai_documents"
      WHERE "organisationId" = ${ctx.organisationId}
        AND "updatedAt" > ${since}::timestamp
        AND ( ${workspaceId ?? null}::text IS NULL OR "workspaceId" = ${workspaceId ?? null}::text )
      ORDER BY "updatedAt" DESC
      LIMIT 100
    `;

    const context = (rows ?? [])
      .map((row) => `[${row.resourceType}:${row.resourceId}] ${row.title ? row.title + '\n' : ''}${row.text}`)
      .join('\n\n');

    const prompt = `Summarize the following workspace activity from the last ${hours} hours into a concise daily digest. Return a JSON object with a "sections" array. Each section has "title" and "items". Include sections: summary, updates, decisions, blockers, actionItems, note. Items should be short bullet strings.`;
    const { result, model } = await this.summarize(prompt, context.slice(0, 12000));

    const sections = this.parseDigestSections(result);
    if (sections.length === 0) {
      sections.push({ title: 'Daily brief', items: [result || 'No activity to summarize.'] });
    }
    return { sections, model, raw: result };
  }

  private parseDigestSections(text: string): { title: string; items: string[] }[] {
    try {
      // Models often wrap JSON in a markdown code fence; strip it before parsing.
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();
      const parsed = JSON.parse(cleaned) as { sections?: unknown };
      if (Array.isArray(parsed.sections)) {
        return parsed.sections
          .map((s: unknown) => {
            const section = (s ?? {}) as { title?: unknown; items?: unknown };
            const title = typeof section.title === 'string' ? section.title : '';
            const rawItems = Array.isArray(section.items) ? section.items : [section.items];
            const items = rawItems
              .filter((i: unknown): i is string => typeof i === 'string' && i.trim().length > 0)
              .map((i) => i.trim());
            return { title, items };
          })
          .filter((s) => s.title && s.items.length > 0);
      }
    } catch {
      // fall through to markdown parser
    }

    const sections: { title: string; items: string[] }[] = [];
    const headerRegex = /\*\*([^\*]+?)(?::\*\*|\*\*)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let lastTitle = '';

    while ((match = headerRegex.exec(text)) !== null) {
      if (lastTitle) {
        const content = text.slice(lastIndex, match.index).trim().replace(/^[-:]\s*/, '');
        if (content) {
          const items = content
            .split(/(?:^|\s)-\s/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          sections.push({ title: lastTitle, items: items.length > 0 ? items : [content] });
        }
      }
      lastTitle = match[1].trim();
      lastIndex = headerRegex.lastIndex;
    }

    if (lastTitle) {
      const content = text.slice(lastIndex).trim().replace(/^[-:]\s*/, '');
      if (content) {
        const items = content
          .split(/(?:^|\s)-\s/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        sections.push({ title: lastTitle, items: items.length > 0 ? items : [content] });
      }
    }

    return sections;
  }

  async extractTasks(
    ctx: OrganisationContextValue,
    text: string,
    sourceType: string,
    sourceId?: string,
    options: { projectId?: string; autoCreate?: boolean } = {},
  ): Promise<Prisma.AiExtractedTaskGetPayload<{ select: { id: true; title: true; description: true; dueDate: true; assigneeHint: true; assigneeId: true; status: true } }>[]> {
    let candidates: Array<{ userId: string; name: string; role?: string }> = [];
    if (options.projectId) {
      candidates = await this.fetchProjectMembers(ctx, options.projectId);
    }

    const instruction = candidates.length
      ? 'Extract actionable tasks from the following text. Choose the most appropriate assignee from the candidate list based on role, department, or context.'
      : 'Extract actionable tasks from the following text.';

    const items = await this.runExtraction<{
      title: string;
      description?: string | null;
      dueDate?: string | null;
      assigneeId?: string | null;
    }>(text, 'tasks', instruction, candidates);

    const workspaceId = ctx.workspaceId ?? null;
    const records = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const records = await Promise.all(
        items.map((item) =>
          tx.aiExtractedTask.create({
            data: {
              organisationId: ctx.organisationId,
              workspaceId,
              sourceType,
              sourceId: sourceId ?? '',
              actorId: ctx.actorId ?? null,
              title: item.title,
              description: item.description ?? null,
              dueDate: item.dueDate ? new Date(item.dueDate) : null,
              assigneeHint: null,
              assigneeId: item.assigneeId ?? null,
              status: 'suggested',
            },
            select: { id: true, title: true, description: true, dueDate: true, assigneeHint: true, assigneeId: true, status: true },
          }),
        ),
      );

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_TASK_EXTRACTED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        resourceType: 'ai_extracted_task',
        resourceId: sourceId ?? 'unknown',
        correlationId: ctx.correlationId,
        payload: {
          sourceType,
          sourceId,
          workspaceId,
          projectId: options.projectId,
          tasks: records,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_TASK_EXTRACTED);

      return records;
    });

    if (options.projectId && options.autoCreate) {
      for (const record of records) {
        await this.createPendingAction(ctx, 'create_task', {
          projectId: options.projectId,
          title: record.title,
          description: record.description,
          dueDate: record.dueDate ? record.dueDate.toISOString() : null,
          assigneeId: record.assigneeId,
        }, sourceId);
      }
    }

    return records;
  }

  async extractDecisions(
    ctx: OrganisationContextValue,
    text: string,
    sourceType: string,
    sourceId?: string,
  ): Promise<Prisma.AiDecisionGetPayload<{ select: { id: true; decision: true; stakeholders: true; status: true } }>[]> {
    const items = await this.runExtraction<{
      decision: string;
      stakeholders?: string[] | null;
    }>(text, 'decisions', 'Extract decisions or resolutions from the following text.');

    const workspaceId = ctx.workspaceId ?? null;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const records = await Promise.all(
        items.map((item) =>
          tx.aiDecision.create({
            data: {
              organisationId: ctx.organisationId,
              workspaceId,
              sourceType,
              sourceId: sourceId ?? '',
              actorId: ctx.actorId ?? null,
              decision: item.decision,
              stakeholders: (item.stakeholders ?? null) as any,
              status: 'suggested',
            },
            select: { id: true, decision: true, stakeholders: true, status: true },
          }),
        ),
      );

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_DECISION_EXTRACTED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        resourceType: 'ai_decision',
        resourceId: sourceId ?? 'unknown',
        correlationId: ctx.correlationId,
        payload: {
          sourceType,
          sourceId,
          workspaceId,
          decisions: records,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_DECISION_EXTRACTED);

      return records;
    });
  }

  private async createPendingAction(
    ctx: OrganisationContextValue,
    actionType: string,
    payload: Record<string, unknown>,
    sourceId?: string,
  ): Promise<void> {
    const workspaceId = ctx.workspaceId ?? null;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rec = await tx.aiActionConfirmation.create({
        data: {
          organisationId: ctx.organisationId,
          workspaceId,
          actorId: ctx.actorId ?? 'unknown',
          actionType,
          payload: payload as any,
          status: 'pending',
        },
        select: { id: true },
      });

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_ACTION_REQUESTED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        resourceType: 'ai_action_confirmation',
        resourceId: rec.id,
        correlationId: ctx.correlationId,
        payload: {
          confirmationId: rec.id,
          actionType,
          sourceId,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_ACTION_REQUESTED);
    });
  }

  async listPendingActions(
    ctx: OrganisationContextValue,
    options: { workspaceId?: string; limit?: number; cursor?: string } = {},
  ): Promise<Prisma.AiActionConfirmationGetPayload<{ select: { id: true; actionType: true; payload: true; status: true; createdAt: true; confirmedAt: true } }>[]> {
    return this.prisma.aiActionConfirmation.findMany({
      where: {
        organisationId: ctx.organisationId,
        actorId: ctx.actorId ?? '',
        status: 'pending',
        workspaceId: options.workspaceId ?? undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.cursor ? 1 : 0,
      cursor: options.cursor ? { id: options.cursor } : undefined,
      select: { id: true, actionType: true, payload: true, status: true, createdAt: true, confirmedAt: true },
    });
  }

  async confirmAction(
    ctx: OrganisationContextValue,
    id: string,
    edits?: Record<string, unknown>,
  ): Promise<Prisma.AiActionConfirmationGetPayload<{ select: { id: true; actionType: true; payload: true; status: true; confirmedAt: true } }>> {
    const confirmation = await this.prisma.aiActionConfirmation.findFirst({
      where: { id, organisationId: ctx.organisationId, actorId: ctx.actorId ?? '', status: 'pending' },
    });
    if (!confirmation) throw new Error('Confirmation not found or already processed');

    const payload = { ...(confirmation.payload as Record<string, unknown> ?? {}), ...(edits ?? {}) } as Record<string, unknown>;

    if (confirmation.actionType === 'create_task') {
      await this.executeCreateTask(ctx, payload);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (confirmation.actionType === 'send_meeting_summary_email') {
        const summaryOutbox = createEventEnvelope({
          eventType: Subjects.AI_SUMMARY_CONFIRMED,
          eventVersion: 1,
          organisationId: ctx.organisationId,
          workspaceId: payload.workspaceId as string | undefined,
          actorId: ctx.actorId,
          resourceType: 'ai_summary',
          resourceId: (payload.resourceId as string) ?? 'unknown',
          correlationId: ctx.correlationId,
          payload: {
            resourceType: payload.resourceType,
            resourceId: payload.resourceId,
            title: payload.title,
            summary: payload.summary,
            participantIds: payload.participantIds,
          },
        });
        await this.outbox.createEvent(tx, summaryOutbox, Subjects.AI_SUMMARY_CONFIRMED);
      }

      const updated = await tx.aiActionConfirmation.update({
        where: { id },
        data: { status: 'confirmed', confirmedAt: new Date(), payload: payload as any },
        select: { id: true, actionType: true, payload: true, status: true, confirmedAt: true },
      });

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_ACTION_CONFIRMED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: confirmation.workspaceId ?? undefined,
        actorId: ctx.actorId,
        resourceType: 'ai_action_confirmation',
        resourceId: updated.id,
        correlationId: ctx.correlationId,
        payload: {
          confirmationId: updated.id,
          actionType: updated.actionType,
          payload: updated.payload,
          workspaceId: confirmation.workspaceId,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_ACTION_CONFIRMED);

      return updated;
    });
  }

  async declineAction(
    ctx: OrganisationContextValue,
    id: string,
  ): Promise<Prisma.AiActionConfirmationGetPayload<{ select: { id: true; actionType: true; payload: true; status: true; confirmedAt: true } }>> {
    const confirmation = await this.prisma.aiActionConfirmation.findFirst({
      where: { id, organisationId: ctx.organisationId, actorId: ctx.actorId ?? '', status: 'pending' },
    });
    if (!confirmation) throw new Error('Confirmation not found or already processed');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.aiActionConfirmation.update({
        where: { id },
        data: { status: 'declined', confirmedAt: new Date() },
        select: { id: true, actionType: true, payload: true, status: true, confirmedAt: true },
      });

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_ACTION_CONFIRMED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: confirmation.workspaceId ?? undefined,
        actorId: ctx.actorId,
        resourceType: 'ai_action_confirmation',
        resourceId: updated.id,
        correlationId: ctx.correlationId,
        payload: {
          confirmationId: updated.id,
          actionType: updated.actionType,
          payload: updated.payload,
          workspaceId: confirmation.workspaceId,
          declined: true,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_ACTION_CONFIRMED);

      return updated;
    });
  }

  private async executeCreateTask(ctx: OrganisationContextValue, payload: Record<string, unknown>): Promise<void> {
    const projectId = payload.projectId as string | undefined;
    const title = payload.title as string | undefined;
    if (!projectId || !title) return;
    await this.createProjectTask(ctx, projectId, {
      title,
      description: payload.description as string | undefined,
      dueDate: payload.dueDate ? new Date(payload.dueDate as string) : null,
      assigneeId: payload.assigneeId as string | undefined,
    });
  }

  private async indexDocument(tx: Prisma.TransactionClient, doc: IndexDocumentInput): Promise<void> {
    const meta = JSON.stringify(doc.metadata);
    const id = randomUUID();
    const q = Prisma.sql`
      INSERT INTO "ai_documents" ("id", "organisationId", "workspaceId", "resourceType", "resourceId", "title", "text", "metadata", "vector")
      VALUES (${id}, ${doc.organisationId}, ${doc.workspaceId ?? null}, ${doc.resourceType}, ${doc.resourceId}, ${doc.title ?? null}, ${doc.text}, ${meta}::jsonb, NULL)
      ON CONFLICT ("organisationId", "resourceType", "resourceId")
      DO UPDATE SET
        "workspaceId" = EXCLUDED."workspaceId",
        "title" = EXCLUDED."title",
        "text" = EXCLUDED."text",
        "metadata" = EXCLUDED."metadata",
        "vector" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    `;
    await tx.$executeRaw(q);
  }

  private async deleteDocument(
    tx: Prisma.TransactionClient,
    { organisationId, resourceType, resourceId }: { organisationId: string; resourceType: string; resourceId: string },
  ): Promise<void> {
    const q = Prisma.sql`
      DELETE FROM "ai_documents"
      WHERE "organisationId" = ${organisationId}
        AND "resourceType" = ${resourceType}
        AND "resourceId" = ${resourceId}
    `;
    await tx.$executeRaw(q);
  }

  private getClient(): OpenAI | null {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const localUrl = this.config.get<string>('LOCAL_AI_URL');

    if (!apiKey && !localUrl) {
      return null;
    }

    return new OpenAI({
      apiKey: apiKey ?? 'local',
      baseURL: localUrl,
    });
  }

  private toResourceType(eventType: string): string | undefined {
    if (eventType.startsWith('teamspace-one.message')) return 'message';
    if (eventType.startsWith('teamspace-one.task')) return 'task';
    if (eventType === Subjects.FILE_PROCESSED) return 'file';
    if (eventType === Subjects.MEETING_ENDED) return 'meeting';
    return undefined;
  }

  private async runExtraction<T>(
    text: string,
    field: 'tasks' | 'decisions',
    instruction: string,
    candidates: Array<{ userId: string; name: string; role?: string }> = [],
  ): Promise<T[]> {
    const client = await this.getClient();
    const model = this.config.get<string>('AI_MODEL') ?? this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    if (!client) {
      return field === 'tasks'
        ? ([{ title: 'Placeholder extracted task', description: 'No AI provider configured', assigneeId: null }] as unknown as T[])
        : ([{ decision: 'Placeholder decision: No AI provider configured.' }] as unknown as T[]);
    }

    let taskSchema = '{ "tasks": [ { "title": string, "description": string | null, "dueDate": string | null (ISO 8601), "assigneeId": string | null } ] }';
    if (candidates.length) {
      const candidateList = candidates.map((c) => `- ${c.userId}: ${c.name}${c.role ? ` (${c.role})` : ''}`).join('\n');
      instruction += `\n\nCandidates:\n${candidateList}\nUse one of the candidate userIds for "assigneeId" or leave it null.`;
    }

    const schema =
      field === 'tasks'
        ? taskSchema
        : '{ "decisions": [ { "decision": string, "stakeholders": string[] | null } ] }';

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `${instruction} Return a JSON object matching this schema: ${schema}`,
          },
          { role: 'user', content: text.slice(0, 12000) },
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content ?? '';
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const items = parsed[field];
      if (!Array.isArray(items)) return [];
      return items as T[];
    } catch (err) {
      this.logger.error(`Extraction failed for ${field}: ${(err as Error).message}`);
      return [];
    }
  }

  private async fetchProjectMembers(
    ctx: OrganisationContextValue,
    projectId: string,
  ): Promise<Array<{ userId: string; name: string; role?: string }>> {
    const projectsUrl = this.config.get<string>('PROJECTS_SERVICE_URL');
    if (!projectsUrl) return [];
    try {
      const response = await fetch(`${projectsUrl}/projects/${encodeURIComponent(projectId)}`, {
        headers: {
          'x-organisation-id': ctx.organisationId,
          'x-actor-id': ctx.actorId ?? '',
          'content-type': 'application/json',
        },
      });
      if (!response.ok) return [];
      const project = (await response.json()) as {
        members?: Array<{ userId: string; role?: string }>;
      };
      return (project.members ?? []).map((m) => ({
        userId: m.userId,
        name: m.userId,
        role: m.role,
      }));
    } catch (err) {
      this.logger.error({ projectId, error: (err as Error).message }, 'Failed to fetch project members');
      return [];
    }
  }

  private async createProjectTask(
    ctx: OrganisationContextValue,
    projectId: string,
    task: { title: string; description?: string | null; dueDate?: Date | null; assigneeId?: string | null },
  ): Promise<void> {
    const projectsUrl = this.config.get<string>('PROJECTS_SERVICE_URL');
    if (!projectsUrl) return;
    const response = await fetch(`${projectsUrl}/tasks`, {
      method: 'POST',
      headers: {
        'x-organisation-id': ctx.organisationId,
        'x-actor-id': ctx.actorId ?? '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        title: task.title,
        description: task.description ?? '',
        status: 'todo',
        assigneeId: task.assigneeId,
        dueDate: task.dueDate ? task.dueDate.toISOString() : undefined,
      }),
    });
    if (!response.ok) {
      throw new Error(`Projects service returned ${response.status}`);
    }
  }
}
