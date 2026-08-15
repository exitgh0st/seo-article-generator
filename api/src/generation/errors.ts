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
  | 'unknown';

export class StageError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    /** Shown to the operator instead of `message` when present. Plain language. */
    readonly remedy?: string,
  ) {
    super(message);
    this.name = 'StageError';
  }
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
    );
    this.name = 'RefusalError';
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

/** Turns anything thrown inside a stage into a classified failure. */
export function classify(error: unknown): StageError {
  if (error instanceof StageError) return error;

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
