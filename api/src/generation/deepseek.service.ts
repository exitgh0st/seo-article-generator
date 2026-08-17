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
   *
   * An unusable reply gets exactly one correction turn before it becomes a
   * failure. Nothing above this retries — `advanceOne` records the failure and
   * the run stops until a person presses a button — so a reply the model would
   * have got right on the next token cost an operator a round trip through the
   * UI. Measured on the draft stage: three consecutive failures on the same
   * frontmatter call, each ending the run.
   *
   * One turn, not a loop. Two identical rejections mean the prompt is wrong
   * rather than the sampling unlucky, and grinding on it spends tokens to reach
   * the same place.
   */
  async json<T>(
    schema: ZodSchema<T>,
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<CompletionResult<T>> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const first = await this.complete(messages, { ...options, jsonMode: true });
    const read = readJson(schema, first);
    if (read.ok) return { value: read.value, usage: first.usage };

    this.logger.warn(
      `${this.model} returned unusable JSON (${read.problem}); asking for a correction.`,
    );

    const second = await this.complete(
      [
        ...messages,
        {
          role: 'assistant',
          // An empty reply leaves nothing to quote back, and an empty assistant
          // turn is not something every provider accepts.
          content: first.content.trim() || '(no content)',
        },
        {
          role: 'user',
          content: [
            `That reply could not be used: ${read.problem}.`,
            '',
            'Reply again with the corrected JSON object and nothing else — no',
            'prose, no explanation, no code fence. Include every key the original',
            'instructions asked for.',
          ].join('\n'),
        },
      ],
      { ...options, jsonMode: true },
    );

    const repaired = readJson(schema, second);
    const usage: Usage = {
      inputTokens: first.usage.inputTokens + second.usage.inputTokens,
      outputTokens: first.usage.outputTokens + second.usage.outputTokens,
    };
    if (repaired.ok) return { value: repaired.value, usage };

    // Twice in a row with nothing at all in the body is the provider failing to
    // answer, not the model answering badly. The remedies differ: one says press
    // Retry, the other says the shape was wrong. DeepSeek's JSON mode is
    // documented to do this occasionally.
    if (!first.content.trim() && !second.content.trim()) {
      throw new ProviderError(
        'The model returned an empty response twice in a row.',
      );
    }

    throw new OutputValidationError(
      `After one correction attempt, ${repaired.problem}`,
    );
  }

  /** Prompt for prose. Used by the humanize stage, which returns markdown. */
  async text(
    system: string,
    user: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<CompletionResult<string>> {
    const result = await this.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      options,
    );

    if (result.finishReason === 'length') {
      throw new OutputValidationError(
        'The model hit its output limit mid-reply, so the result is incomplete.',
      );
    }
    if (!result.content.trim()) {
      throw new OutputValidationError('The model returned an empty response.');
    }

    return { value: result.content, usage: result.usage };
  }

  /**
   * One round trip.
   *
   * Throws only for the two things no caller can do anything with: a transport
   * failure, and a refusal. An empty or truncated reply comes back as data,
   * because `json` treats it as something to correct while `text` treats it as
   * fatal.
   */
  private async complete(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
  ): Promise<{ content: string; finishReason: string | null; usage: Usage }> {
    let response: OpenAI.Chat.Completions.ChatCompletion;

    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 8_000,
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages,
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

    const usage: Usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    this.logger.debug(
      `${this.model}: ${usage.inputTokens} in / ${usage.outputTokens} out`,
    );

    return { content, finishReason: choice?.finish_reason ?? null, usage };
  }
}

type JsonRead<T> = { ok: true; value: T } | { ok: false; problem: string };

/**
 * Parse and validate one reply, describing the failure in the second person so
 * the text can be handed straight back to the model as a correction.
 */
function readJson<T>(
  schema: ZodSchema<T>,
  reply: { content: string; finishReason: string | null },
): JsonRead<T> {
  // Truncation is diagnosed from what arrived rather than from `finish_reason`
  // alone: an object that stops at exactly the token limit is still an object,
  // and rejecting it would throw away a usable answer. When something is wrong,
  // though, a reply that ran out of room is worth saying so — "be brief" is a
  // correction the model can act on, where "that was not JSON" is not.
  const truncated = reply.finishReason === 'length';
  const cutOff = (because: string) =>
    truncated
      ? 'it hit the output limit and was cut off mid-reply, leaving it incomplete'
      : because;

  if (!reply.content.trim()) {
    return { ok: false, problem: cutOff('it was empty') };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(reply.content));
  } catch {
    return {
      ok: false,
      problem: cutOff(
        `it was not valid JSON — it began "${reply.content.slice(0, 200)}"`,
      ),
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      problem: cutOff(
        `it did not match the expected shape: ${result.error.issues
          .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
          .slice(0, 5)
          .join('; ')}`,
      ),
    };
  }

  return { ok: true, value: result.data };
}

/** Models wrap JSON in ```json fences often enough to be worth handling. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}
