import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Prisma } from '#prisma';
import { PrismaService } from '../prisma/prisma.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { createEventEnvelope, Subjects, type EventEnvelope } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';

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

  async summarize(prompt: string, sourceText?: string): Promise<{ result: string; model: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    if (!apiKey) {
      return {
        result: `No OpenAI key configured. Placeholder summary for: ${prompt}`,
        model: 'none',
      };
    }

    const content = sourceText ? `${prompt}\n\n${sourceText.slice(0, 12000)}` : prompt;

    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes text.' },
          { role: 'user', content },
        ],
      });
      const result = completion.choices[0]?.message?.content ?? '';
      return { result, model };
    } catch (err) {
      this.logger.error(`OpenAI call failed: ${(err as Error).message}`);
      return { result: 'OpenAI summarization failed.', model: 'none' };
    }
  }

  async embed(text: string): Promise<number[]> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const input = text.slice(0, 8000).trim();

    if (!apiKey || !input) {
      return Array(1536).fill(0);
    }

    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
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
    const rows = await this.prisma.$queryRaw<Array<{ id: string; text: string }>>`
      SELECT "id", "text" FROM "ai_documents"
      WHERE "organisationId" = ${data.organisationId}
        AND "resourceType" = ${data.resourceType}
        AND "resourceId" = ${data.resourceId}
      LIMIT 1
    `;

    const text = rows[0]?.text ?? '';
    const prompt = `Summarize the following meeting context for meeting ${data.resourceId}.`;
    const { result, model } = await this.summarize(prompt, text);

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
        resourceType: 'ai_summary',
        resourceId: data.resourceId,
        correlationId: randomUUID(),
        payload: {
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          result,
          model,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_SUMMARY_COMPLETED);
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
        AND ( ${workspaceId} IS NULL OR "workspaceId" = ${workspaceId} )
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
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    let answer = 'OpenAI is not configured. No answer could be generated.';

    if (apiKey) {
      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey });
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
          model: apiKey ? model : 'none',
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

  async extractTasks(
    ctx: OrganisationContextValue,
    text: string,
    sourceType: string,
    sourceId?: string,
  ): Promise<Prisma.AiExtractedTaskGetPayload<{ select: { id: true; title: true; description: true; dueDate: true; assigneeHint: true; status: true } }>[]> {
    const items = await this.runExtraction<{
      title: string;
      description?: string | null;
      dueDate?: string | null;
      assignee?: string | null;
    }>(text, 'tasks', 'Extract actionable tasks from the following text.');

    const workspaceId = ctx.workspaceId ?? null;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
              assigneeHint: item.assignee ?? null,
              status: 'suggested',
            },
            select: { id: true, title: true, description: true, dueDate: true, assigneeHint: true, status: true },
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
          tasks: records,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_TASK_EXTRACTED);

      return records;
    });
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

  async confirmAction(
    ctx: OrganisationContextValue,
    actionType: string,
    payload: Record<string, unknown>,
  ): Promise<Prisma.AiActionConfirmationGetPayload<{ select: { id: true; actionType: true; payload: true; status: true; confirmedAt: true } }>> {
    const workspaceId = ctx.workspaceId ?? null;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const confirmation = await tx.aiActionConfirmation.create({
        data: {
          organisationId: ctx.organisationId,
          workspaceId,
          actorId: ctx.actorId ?? 'unknown',
          actionType,
          payload: payload as any,
          status: 'confirmed',
          confirmedAt: new Date(),
        },
        select: { id: true, actionType: true, payload: true, status: true, confirmedAt: true },
      });

      const outbox = createEventEnvelope({
        eventType: Subjects.AI_ACTION_CONFIRMED,
        eventVersion: 1,
        organisationId: ctx.organisationId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        resourceType: 'ai_action_confirmation',
        resourceId: confirmation.id,
        correlationId: ctx.correlationId,
        payload: {
          confirmationId: confirmation.id,
          actionType,
          payload,
          workspaceId,
        },
      });
      await this.outbox.createEvent(tx, outbox, Subjects.AI_ACTION_CONFIRMED);

      return confirmation;
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

  private toResourceType(eventType: string): string | undefined {
    if (eventType.startsWith('reactify.message')) return 'message';
    if (eventType.startsWith('reactify.task')) return 'task';
    if (eventType === Subjects.FILE_PROCESSED) return 'file';
    if (eventType === Subjects.MEETING_ENDED) return 'meeting';
    return undefined;
  }

  private async runExtraction<T>(
    text: string,
    field: 'tasks' | 'decisions',
    instruction: string,
  ): Promise<T[]> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    if (!apiKey) {
      return field === 'tasks'
        ? ([{ title: 'Placeholder extracted task', description: 'OpenAI is not configured' }] as unknown as T[])
        : ([{ decision: 'Placeholder decision: OpenAI is not configured.' }] as unknown as T[]);
    }

    const schema =
      field === 'tasks'
        ? '{ "tasks": [ { "title": string, "description": string | null, "dueDate": string | null (ISO 8601), "assignee": string | null } ] }'
        : '{ "decisions": [ { "decision": string, "stakeholders": string[] | null } ] }';

    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
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
}
