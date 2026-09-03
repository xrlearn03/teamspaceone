import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createEventEnvelope, Subjects, type EventEnvelope } from '@reactify/event-contracts';
import { type OrganisationContextValue } from '@reactify/organisation-context';
import { Prisma } from '#prisma';
import { OutboxService } from '../outbox/outbox.service.js';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  async summarize(prompt: string): Promise<{ result: string; model: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    let result = 'No OpenAI key configured. This is a placeholder summary.';
    let model = 'none';

    if (apiKey) {
      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey });
        const completion = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that summarizes text.' },
            { role: 'user', content: prompt },
          ],
        });
        const content = completion.choices[0]?.message?.content;
        if (content) {
          result = content;
          model = 'gpt-4o-mini';
        }
      } catch (err) {
        this.logger.error(`OpenAI call failed: ${(err as Error).message}`);
      }
    }

    return { result, model };
  }

  async handleEvent(tx: Prisma.TransactionClient, envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== Subjects.MEETING_ENDED) return;
    const payload = (envelope.payload ?? {}) as Record<string, any>;
    const prompt = `Summarize the following meeting context for meeting ${payload.id as string}.`;
    const { result, model } = await this.summarize(prompt);

    await tx.aiSummary.upsert({
      where: { resourceType_resourceId: { resourceType: 'meeting', resourceId: payload.id as string } },
      create: {
        organisationId: envelope.organisationId,
        resourceType: 'meeting',
        resourceId: payload.id as string,
        prompt,
        result,
        model,
      },
      update: { result, model },
    });

    const outbox = createEventEnvelope({
      eventType: Subjects.AI_SUMMARY_COMPLETED,
      organisationId: envelope.organisationId,
      actorId: envelope.actorId,
      resourceType: 'ai_summary',
      resourceId: payload.id as string,
      correlationId: envelope.correlationId,
      payload: {
        resourceType: 'meeting',
        resourceId: payload.id as string,
        result,
        model,
      },
    });

    await this.outbox.createEvent(tx, outbox, Subjects.AI_SUMMARY_COMPLETED);
  }
}
