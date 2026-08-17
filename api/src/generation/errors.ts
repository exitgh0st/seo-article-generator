/**
 * Failure classification, because the UI shows a remedy rather than a trace.
 *
 * The distinction that matters to a non-technical operator is "will pressing the
 * button again help?". A provider hiccup says yes. A refusal says no — the same
 * input will be declined again and the topic needs rewording. Collapsing those
 * into one "something went wrong" teaches the operator to retry everything twice
 * and then give up.
 */
export type ErrorKind =
  | 'refusal'
  | 'provider'
  | 'validation'
  | 'timeout'
  /** The topic cannot produce an article. Nothing about this run will fix it. */
  | 'unworkable'
  | 'unknown';

export class StageError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    /** Shown to the operator instead of `message` when present. Plain language. */
    readonly remedy?: string,
    /**
     * Whether running the identical stage again could plausibly succeed. Drives
     * both the automatic retry below and whether the UI offers the button at all.
     *
     * Not derivable from `kind`, which is why it is stored: OutputValidationError
     * is `validation` and is the most retryable failure in the system, while the
     * grounding gate is also `validation` and mostly is not. Defaulting to true
     * keeps the old behaviour for anything that has not been thought about.
     */
    readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = 'StageError';
  }
}

/**
 * How many times one stage may run before its failure is the run's failure.
 *
 * Two, not more. The point is to absorb a single provider blip without a person
 * watching — a Tavily 500 or a DeepSeek timeout mid-run used to end a run that
 * would have succeeded on the next attempt. Beyond two the failure is not a blip,
 * and spending a third stage's worth of tokens to confirm that is just expensive.
 */
export const MAX_STAGE_ATTEMPTS = 2;

/**
 * Whether the worker should quietly run this stage again instead of failing the
 * run. Pure, and separate from the worker, so the decision can be tested without
 * standing up Prisma.
 *
 * `attempt` is the count *including* the one that just failed — the worker
 * increments it before running.
 */
export function shouldRetry(error: StageError, attempt: number): boolean {
  return error.retryable && attempt < MAX_STAGE_ATTEMPTS;
}

/** The model declined. Retrying identical input changes nothing. */
export class RefusalError extends StageError {
  constructor(message: string, readonly category?: string) {
    super(
      message,
      'refusal',
      'The model declined this topic. This happens on legitimate security ' +
        'stories. Reword the topic to emphasise defence and remediation rather ' +
        'than how an attack is carried out, then run it again.',
      false,
    );
    this.name = 'RefusalError';
  }
}

/**
 * The topic itself will not produce an article, and no amount of running this
 * stage again changes that.
 *
 * Distinct from a refusal, which is about wording, and from a provider error,
 * which is about luck. This one means the sources do not exist: nothing was
 * found, or nothing primary was. The remedy is a different topic, and the UI
 * shows a link to start one rather than a retry button that would spend another
 * minute proving the same thing.
 */
export class TopicUnworkableError extends StageError {
  constructor(message: string, remedy: string) {
    super(message, 'unworkable', remedy, false);
    this.name = 'TopicUnworkableError';
  }
}

/** Transport, rate limit, 5xx. Worth retrying, usually as-is. */
export class ProviderError extends StageError {
  constructor(message: string) {
    super(
      message,
      'provider',
      'The AI service or search provider did not respond. This is usually ' +
        'temporary — press Retry.',
    );
    this.name = 'ProviderError';
  }
}

/** The model replied, but not in the shape we asked for. */
export class OutputValidationError extends StageError {
  constructor(message: string) {
    super(
      message,
      'validation',
      'The model returned something we could not read. Press Retry — this ' +
        'usually succeeds on a second attempt.',
    );
    this.name = 'OutputValidationError';
  }
}

/**
 * The draft cited an identifier no fetched source supports.
 *
 * Kept distinct because the generic remedy is actively wrong here. "Press Retry"
 * is what an operator sees for a provider blip, and grounding is not a blip: the
 * same brief regenerates a similar draft, and if the identifier came from the
 * brief rather than from the model, retrying cannot help at all. Naming the
 * identifiers is the whole remedy — they are the one thing that tells the
 * operator which of those two situations they are in.
 */
export class GroundingError extends StageError {
  constructor(detail: string, readonly unsourced: string[]) {
    super(
      detail,
      'validation',
      `The draft cited ${unsourced.length === 1 ? 'an identifier that no source' : `${unsourced.length} identifiers that no source`} for this brief mentions: ${unsourced.join(', ')}. ` +
        'Retry once — the model often drops it. If the same identifier comes ' +
        'back, it is in the brief rather than the draft, and the topic needs ' +
        're-researching against a source that actually documents it.',
    );
    this.name = 'GroundingError';
  }
}

/**
 * The grounding gate lives in ArticlesService.save(), which is shared with the
 * hand-written path and so speaks HTTP: it throws a BadRequestException carrying
 * the offending identifiers on its response body. Reading them here rather than
 * in the draft stage covers the humanize stage too, which re-checks grounding
 * after the rewrite for the same reason and would otherwise lose them the same
 * way.
 */
function asGroundingError(error: unknown): GroundingError | null {
  const body = (error as { response?: unknown })?.response;
  if (!body || typeof body !== 'object') return null;

  const { unsourcedCves, unsourcedIndicators, message } = body as {
    unsourcedCves?: unknown;
    unsourcedIndicators?: unknown;
    message?: unknown;
  };
  const unsourced = [
    ...(Array.isArray(unsourcedCves) ? unsourcedCves : []),
    ...(Array.isArray(unsourcedIndicators) ? unsourcedIndicators : []),
  ].map(String);

  if (!unsourced.length) return null;

  return new GroundingError(
    `${typeof message === 'string' ? message : 'Grounding check failed'} Unsourced: ${unsourced.join(', ')}.`,
    unsourced,
  );
}

/** Turns anything thrown inside a stage into a classified failure. */
export function classify(error: unknown): StageError {
  if (error instanceof StageError) return error;

  const grounding = asGroundingError(error);
  if (grounding) return grounding;

  const message = (error as Error)?.message ?? String(error);
  const status = (error as { status?: number })?.status;

  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return new ProviderError(message);
  }
  if (/timeout|timed out|ETIMEDOUT|AbortError/i.test(message)) {
    return new StageError(
      message,
      'timeout',
      'That step took too long. Press Retry.',
    );
  }
  return new StageError(message, 'unknown');
}
