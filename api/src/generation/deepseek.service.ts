import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ZodSchema } from 'zod';
import {
  OutputValidationError,
  ProviderError,
  RefusalError,
} from './errors';
import type { Env } from '../config/env.schema';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult<T> {
  value: T;
  usage: Usage;
}

/**
 * One prompted call, in and out. No tool loop.
 *
 * The previous design let the model drive: it chose tools, the server executed
 * them, and the whole message array was resent on every iteration. A single
 * article measured 1.6M input tokens and the path it took varied run to run.
 *
 * Here each stage owns exactly what it sends and code owns the sequence, which is
 * why the stage timeline can promise anything at all about progress. Searching
 * and fetching happen in TypeScript, so the fetched text is stored where the
 * grounding gate can read it rather than passing through the model's hands.
 */
@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: ConfigService<Env, true>) {
    this.client = new OpenAI({
      apiKey: config.getOrThrow<string>('DEEPSEEK_API_KEY'),
      baseURL: config.get('DEEPSEEK_BASE_URL', { infer: true }),
      // The SDK retries 429/5xx with backoff. Anything it gives up on becomes a
      // ProviderError, which the UI presents as "press Retry".
      maxRetries: 2,
      timeout: 180_000,
    });
    this.model = config.get('DEEPSEEK_MODEL', { infer: true });
  }

  /**
   * Prompt for JSON and validate it against `schema` before returning.
   *
   * Temperature is pinned. The old chat loop left it unset, which meant a
   * pipeline whose entire premise is factual consistency ran at whatever the
   * provider defaulted to that week.
   */
  async json<T>(
    schema: ZodSchema<T>,
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<CompletionResult<T>> {
    const raw = await this.raw(system, user, {
      ...options,
      jsonMode: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw.value));
    } catch {
      throw new OutputValidationError(
        `Expected JSON, got ${raw.value.slice(0, 200)}`,
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new OutputValidationError(
        `Response did not match the expected shape: ${result.error.issues
          .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
          .slice(0, 5)
          .join('; ')}`,
      );
    }

    return { value: result.data, usage: raw.usage };
  }

  /** Prompt for prose. Used by the humanize stage, which returns markdown. */
  async text(
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<CompletionResult<string>> {
    return this.raw(system, user, options);
  }

  private async raw(
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
  ): Promise<CompletionResult<string>> {
    let response: OpenAI.Chat.Completions.ChatCompletion;

    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 8_000,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
    } catch (error) {
      throw new ProviderError((error as Error).message);
    }

    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';

    // A content filter stop is a refusal, not an outage — retrying the same
    // input will be declined again, so the operator needs to know to reword.
    if (choice?.finish_reason === 'content_filter') {
      throw new RefusalError('The model declined to answer this prompt.');
    }
    if (choice?.finish_reason === 'length') {
      throw new OutputValidationError(
        'The model hit its output limit mid-reply, so the result is incomplete.',
      );
    }
    if (!content.trim()) {
      throw new OutputValidationError('The model returned an empty response.');
    }

    const usage: Usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    this.logger.debug(
      `${this.model}: ${usage.inputTokens} in / ${usage.outputTokens} out`,
    );

    return { value: content, usage };
  }
}

/** Models wrap JSON in ```json fences often enough to be worth handling. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}
