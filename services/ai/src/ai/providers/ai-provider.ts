import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';

export interface ChatInput {
  system: string;
  user: string;
}

export interface ChatOutput {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  status: 'ok' | 'no_provider' | 'error';
}

export interface JsonInput<T extends object> {
  system: string;
  user: string;
  schemaName: string;
  required?: (keyof T)[];
}

export interface JsonOutput<T extends object> {
  data: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
  status: 'ok' | 'no_provider' | 'error';
}

export interface EmbedOutput {
  embedding: number[];
  model: string;
  promptTokens: number;
  status: 'ok' | 'no_provider' | 'error';
}

export class AiProvider {
  private readonly logger = new Logger(AiProvider.name);
  private client: OpenAI | null | undefined;

  constructor(private readonly config: ConfigService) {}

  get activeModel(): string {
    return this.config.get<string>('AI_MODEL') ?? this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
  }

  get embeddingModel(): string {
    return this.config.get<string>('AI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
  }

  get configuredModel(): string {
    return this.getClient() ? this.activeModel : 'none';
  }

  async complete(input: ChatInput): Promise<ChatOutput> {
    const client = this.getClient();
    const model = this.activeModel;
    if (!client) {
      return { text: '', model: 'none', promptTokens: 0, completionTokens: 0, status: 'no_provider' };
    }

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      } as OpenAI.ChatCompletionCreateParamsNonStreaming);

      const text = completion.choices[0]?.message?.content ?? '';
      const usage = completion.usage;
      return {
        text,
        model,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        status: 'ok',
      };
    } catch (err) {
      this.logger.error(`Chat completion failed: ${(err as Error).message}`);
      return { text: '', model: 'none', promptTokens: 0, completionTokens: 0, status: 'error' };
    }
  }

  async completeJson<T extends object>(input: JsonInput<T>): Promise<JsonOutput<T>> {
    const client = this.getClient();
    const model = this.activeModel;
    if (!client) {
      return { data: {} as T, model: 'none', promptTokens: 0, completionTokens: 0, status: 'no_provider' };
    }

    const run = async (user: string): Promise<{ data: T; usage: { prompt: number; completion: number } } | null> => {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
        } as OpenAI.ChatCompletionCreateParamsNonStreaming);

        const raw = completion.choices[0]?.message?.content ?? '';
        const parsed = this.parseJson(raw) as T;
        if (this.isValid(parsed, input.required)) {
          const usage = completion.usage;
          return {
            data: parsed,
            usage: {
              prompt: usage?.prompt_tokens ?? 0,
              completion: usage?.completion_tokens ?? 0,
            },
          };
        }
      } catch (err) {
        this.logger.warn(`JSON completion/parse failed for ${input.schemaName}: ${(err as Error).message}`);
      }
      return null;
    };

    const first = await run(input.user);
    if (first) {
      return { data: first.data, model, promptTokens: first.usage.prompt, completionTokens: first.usage.completion, status: 'ok' };
    }

    this.logger.warn(`Retrying JSON completion for ${input.schemaName}`);
    const retryUser = `${input.user}\n\nYou must output only a single valid JSON object with all required fields and no extra text.`.slice(0, 16000);
    const second = await run(retryUser);

    if (second) {
      return { data: second.data, model, promptTokens: second.usage.prompt, completionTokens: second.usage.completion, status: 'ok' };
    }

    return { data: {} as T, model: 'none', promptTokens: 0, completionTokens: 0, status: 'error' };
  }

  async embed(text: string): Promise<EmbedOutput> {
    const client = this.getClient();
    const model = this.embeddingModel;
    const input = text.slice(0, 8000).trim();
    if (!client || !input) {
      return { embedding: Array(1536).fill(0), model: 'none', promptTokens: 0, status: 'no_provider' };
    }

    try {
      const response = await client.embeddings.create({
        model,
        input,
        encoding_format: 'float',
      });
      const embedding = response.data[0]?.embedding ?? Array(1536).fill(0);
      return {
        embedding,
        model,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        status: 'ok',
      };
    } catch (err) {
      this.logger.error(`Embedding failed: ${(err as Error).message}`);
      return { embedding: Array(1536).fill(0), model: 'none', promptTokens: 0, status: 'error' };
    }
  }

  private getClient(): OpenAI | null {
    if (this.client !== undefined) return this.client;

    const provider = this.config.get<string>('AI_PROVIDER') ?? 'openai';
    if (provider !== 'openai') {
      this.client = null;
      return this.client;
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY') ?? this.config.get<string>('AI_API_KEY');
    const baseURL = this.config.get<string>('AI_BASE_URL') ?? this.config.get<string>('LOCAL_AI_URL');

    if (!apiKey && !baseURL) {
      this.client = null;
      return this.client;
    }

    this.client = new OpenAI({ apiKey: apiKey ?? 'local', baseURL });
    return this.client;
  }

  private parseJson(text: string): unknown {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();
    return JSON.parse(cleaned);
  }

  private isValid<T extends object>(data: unknown, required?: (keyof T)[]): data is T {
    if (!data || typeof data !== 'object') return false;
    if (!required || required.length === 0) return true;
    return required.every((key) => (data as Record<string, unknown>)[key as string] !== undefined);
  }
}
