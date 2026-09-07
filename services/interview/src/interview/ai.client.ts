import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrganisationContextValue } from '@teamspace-one/organisation-context';

export interface AiCandidate {
  name: string;
  email?: string;
}

export interface AiJob {
  title: string;
  description?: string;
  requirements?: string;
}

export interface AiQuestion {
  category: string;
  question: string;
}

export interface AiScreenInput {
  resumeText?: string;
  candidate: AiCandidate;
  job: AiJob;
}

export interface AiScreenResult {
  matchScore: number;
  skillsFound: string[];
  missingRequirements: string[];
  summary: string;
  confidence: string;
  model: string;
  promptVersion: string;
}

export interface AiQuestionConfig {
  count?: number;
  difficulty?: string;
  categories?: string[];
}

export interface AiQuestionsInput {
  job: AiJob;
  config?: AiQuestionConfig;
  transcript?: Array<{ question: string; answer: string }>;
}

export interface AiQuestionsResult {
  questions: AiQuestion[];
  model: string;
  promptVersion: string;
}

export interface AiTranscriptTurn {
  question: string;
  answer: string;
}

export interface AiEvaluateInput {
  job: AiJob;
  transcript: AiTranscriptTurn[];
  criteria?: string[];
}

export interface AiEvaluateResult {
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  cultureFitScore: number;
  overallScore: number;
  recommendation: string;
  summary: string;
  suggestedFollowUps: string[];
  model: string;
  promptVersion: string;
}

@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  constructor(private readonly config: ConfigService) {}

  private internalHeaders(ctx: OrganisationContextValue): Record<string, string> {
    const apiKey = this.config.get<string>('INTERNAL_API_KEY');
    if (!apiKey) {
      throw new Error('INTERNAL_API_KEY environment variable is required');
    }
    const headers: Record<string, string> = {
      'x-internal-api-key': apiKey,
      'x-internal-caller': 'interview-service',
      'x-organisation-id': ctx.organisationId,
      'content-type': 'application/json',
    };
    if (ctx.actorId) headers['x-actor-id'] = ctx.actorId;
    if (ctx.correlationId) headers['x-correlation-id'] = ctx.correlationId;
    return headers;
  }

  private requireAiUrl(): string {
    const url = this.config.get<string>('AI_SERVICE_URL');
    if (!url) {
      throw new ServiceUnavailableException('AI_SERVICE_URL is not configured');
    }
    return url;
  }

  async fetchResumeText(
    ctx: OrganisationContextValue,
    fileId: string,
  ): Promise<string | undefined> {
    const baseUrl = this.config.get<string>('FILE_STORAGE_SERVICE_URL');
    if (!baseUrl) {
      this.logger.warn('FILE_STORAGE_SERVICE_URL not configured; cannot fetch resume text');
      return undefined;
    }
    try {
      const response = await fetch(`${baseUrl}/files/${encodeURIComponent(fileId)}`, {
        headers: this.internalHeaders(ctx),
      });
      if (!response.ok) return undefined;
      const record = (await response.json()) as {
        metadata?: { textPreview?: string; extractedText?: string };
      };
      const metadata = record.metadata ?? {};
      return metadata.extractedText || metadata.textPreview || undefined;
    } catch (err) {
      this.logger.warn({ error: (err as Error).message, fileId }, 'Failed to fetch resume text');
      return undefined;
    }
  }

  async screen(ctx: OrganisationContextValue, input: AiScreenInput): Promise<AiScreenResult> {
    const baseUrl = this.requireAiUrl();
    const response = await fetch(`${baseUrl}/ai/interview/screen`, {
      method: 'POST',
      headers: this.internalHeaders(ctx),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`AI service screening failed with status ${response.status}`);
    }
    try {
      return (await response.json()) as AiScreenResult;
    } catch {
      throw new ServiceUnavailableException('AI service screening returned invalid JSON');
    }
  }

  async questions(ctx: OrganisationContextValue, input: AiQuestionsInput): Promise<AiQuestionsResult> {
    const baseUrl = this.requireAiUrl();
    const response = await fetch(`${baseUrl}/ai/interview/questions`, {
      method: 'POST',
      headers: this.internalHeaders(ctx),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`AI question generation failed with status ${response.status}`);
    }
    try {
      return (await response.json()) as AiQuestionsResult;
    } catch {
      throw new ServiceUnavailableException('AI question generation returned invalid JSON');
    }
  }

  async evaluate(ctx: OrganisationContextValue, input: AiEvaluateInput): Promise<AiEvaluateResult> {
    const baseUrl = this.requireAiUrl();
    const response = await fetch(`${baseUrl}/ai/interview/evaluate`, {
      method: 'POST',
      headers: this.internalHeaders(ctx),
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`AI evaluation failed with status ${response.status}`);
    }
    try {
      return (await response.json()) as AiEvaluateResult;
    } catch {
      throw new ServiceUnavailableException('AI evaluation returned invalid JSON');
    }
  }
}
