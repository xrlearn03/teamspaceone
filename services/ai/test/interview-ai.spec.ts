import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../src/ai/ai.service.js';
import { AiProvider } from '../src/ai/providers/ai-provider.js';

describe('Interview AI', () => {
  const ctx = { organisationId: 'org-1', actorId: 'user-1' } as any;

  const makeService = (configValue: Record<string, string | undefined> = {}) => {
    const config = {
      get: (key: string, fallback?: string) => (configValue[key] ?? fallback) as any,
    } as unknown as ConfigService;
    const prisma = { aiAuditLog: { create: jest.fn().mockResolvedValue({}) } } as any;
    const outbox = {} as any;
    const queue = {} as any;
    const service = new AiService(outbox, config, prisma, queue);
    return { service, prisma, config };
  };

  describe('AiProvider', () => {
    it('should parse and validate structured JSON output', async () => {
      const config = { get: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService;
      const provider = new AiProvider(config);
      const client = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: JSON.stringify({ questions: [{ category: 'technical', question: 'What is a closure?' }] }) } }],
              usage: { prompt_tokens: 120, completion_tokens: 40 },
            }),
          },
        },
      } as any;
      jest.spyOn(provider as any, 'getClient').mockReturnValue(client);

      const { data, status, promptTokens, completionTokens } = await provider.completeJson<Record<string, unknown>>({
        system: 'You generate questions.',
        user: 'Generate one question.',
        schemaName: 'questions',
        required: ['questions'],
      });

      expect(status).toBe('ok');
      expect(promptTokens).toBe(120);
      expect(completionTokens).toBe(40);
      expect(Array.isArray(data.questions)).toBe(true);
      expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should retry once on invalid JSON and then fail', async () => {
      const config = { get: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService;
      const provider = new AiProvider(config);
      const client = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{ message: { content: 'not-json' } }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }),
          },
        },
      } as any;
      jest.spyOn(provider as any, 'getClient').mockReturnValue(client);

      const { data, status } = await provider.completeJson<Record<string, unknown>>({
        system: 'You output JSON.',
        user: 'Return foo.',
        schemaName: 'foo',
        required: ['foo'],
      });

      expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(status).toBe('error');
      expect(data).toEqual({});
    });
  });

  describe('input validation', () => {
    it('screenCandidate requires resumeText and job.title', async () => {
      const { service } = makeService();
      await expect(service.screenCandidate(ctx, { resumeText: '', candidate: { name: 'A' }, job: { title: '' } } as any)).rejects.toThrow(BadRequestException);
    });

    it('generateQuestions requires job.title and caps transcript length', async () => {
      const { service } = makeService();
      await expect(service.generateQuestions(ctx, { job: { title: '' }, config: {}, transcript: [] } as any)).rejects.toThrow(BadRequestException);
      const long = Array.from({ length: 101 }, () => ({ question: 'Q', answer: 'A' }));
      await expect(service.generateQuestions(ctx, { job: { title: 'Dev' }, config: {}, transcript: long } as any)).rejects.toThrow(BadRequestException);
    });

    it('evaluateInterview requires job.title and non-empty transcript', async () => {
      const { service } = makeService();
      await expect(service.evaluateInterview(ctx, { job: { title: '' }, transcript: [] } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deterministic fallback when no provider', () => {
    it('screen returns zeros and no-provider model', async () => {
      const { service } = makeService();
      const result = await service.screenCandidate(ctx, {
        resumeText: 'Senior TypeScript engineer',
        candidate: { name: 'Jane' },
        job: { title: 'Senior Engineer', requirements: 'TypeScript, Node.js' },
      });

      expect(result.matchScore).toBe(0);
      expect(result.model).toBe('none');
      expect(result.promptVersion).toBe('screening.v1');
    });

    it('questions returns empty questions and no-provider model', async () => {
      const { service } = makeService();
      const result = await service.generateQuestions(ctx, { job: { title: 'Dev' }, config: {} } as any);

      expect(result.questions).toEqual([]);
      expect(result.model).toBe('none');
      expect(result.promptVersion).toBe('interview.questions.v1');
    });

    it('evaluate returns zeroed scores and neutral recommendation', async () => {
      const { service } = makeService();
      const result = await service.evaluateInterview(ctx, {
        job: { title: 'Dev' },
        transcript: [{ question: 'Q1', answer: 'A1' }],
      } as any);

      expect(result.technicalScore).toBe(0);
      expect(result.recommendation).toBe('neutral');
      expect(result.model).toBe('none');
      expect(result.promptVersion).toBe('interview.evaluate.v1');
    });
  });
});
