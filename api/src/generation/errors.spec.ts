import { BadRequestException } from '@nestjs/common';
import {
  classify,
  GroundingError,
  MAX_STAGE_ATTEMPTS,
  OutputValidationError,
  ProviderError,
  RefusalError,
  shouldRetry,
  TopicUnworkableError,
} from './errors';

/**
 * A stage failure is only as useful as what reaches the run page. The grounding
 * gate throws from ArticlesService.save(), several frames below the stage, and
 * its identifiers used to be dropped on the way up: the operator got "remove it,
 * or research it first" with no way to know what "it" was, filed under an
 * `unknown` kind whose remedy is "press Retry".
 */
describe('classify', () => {
  const groundingFailure = () =>
    new BadRequestException({
      statusCode: 400,
      message: 'Article contains CVE identifiers that appear in no source.',
      unsourcedCves: ['CVE-2026-48356'],
      unsourcedIndicators: [],
      warnings: [],
    });

  it('recognises a grounding failure as a validation error', () => {
    expect(classify(groundingFailure()).kind).toBe('validation');
  });

  it('names the offending identifier in the operator remedy', () => {
    const remedy = classify(groundingFailure()).remedy ?? '';
    expect(remedy).toContain('CVE-2026-48356');
  });

  it('keeps the identifiers on the error for persistence', () => {
    const classified = classify(groundingFailure());
    expect(classified).toBeInstanceOf(GroundingError);
    expect((classified as GroundingError).unsourced).toEqual(['CVE-2026-48356']);
  });

  it('carries the identifiers into the detail line as well as the remedy', () => {
    expect(classify(groundingFailure()).message).toContain('CVE-2026-48356');
  });

  it('reports indicators of compromise alongside CVEs', () => {
    const classified = classify(
      new BadRequestException({
        message: 'Article contains indicators of compromise.',
        unsourcedCves: [],
        unsourcedIndicators: ['192.42.116[.]58'],
      }),
    );
    expect((classified as GroundingError).unsourced).toEqual(['192.42.116[.]58']);
    expect(classified.remedy).toContain('an identifier');
  });

  it('pluralises the remedy once there is more than one', () => {
    const classified = classify(
      new BadRequestException({
        message: 'nope',
        unsourcedCves: ['CVE-2026-48356', 'CVE-2026-48000'],
      }),
    );
    expect(classified.remedy).toContain('2 identifiers');
  });

  describe('leaves everything else alone', () => {
    it('does not claim an ordinary 400 as a grounding failure', () => {
      const classified = classify(
        new BadRequestException({ message: 'Article failed validation', errors: ['x'] }),
      );
      expect(classified).not.toBeInstanceOf(GroundingError);
      expect(classified.kind).toBe('unknown');
    });

    it('passes an already-classified StageError through untouched', () => {
      const original = new ProviderError('tavily 500');
      expect(classify(original)).toBe(original);
    });

    it('still classifies a 429 as a provider error', () => {
      expect(classify(Object.assign(new Error('rate limited'), { status: 429 })).kind).toBe(
        'provider',
      );
    });

    it('still classifies a timeout', () => {
      expect(classify(new Error('socket timed out')).kind).toBe('timeout');
    });
  });
});

/**
 * `retryable` is what decides whether a run quietly carries on or stops and waits
 * for a person, so it is deliberately a property rather than a lookup on `kind`.
 * The two `validation` cases below are the reason: one is the most retryable
 * failure in the system and the other cannot be retried at all.
 */
describe('retryable', () => {
  it.each([
    ['a provider blip', new ProviderError('tavily 500'), true],
    ['unreadable model output', new OutputValidationError('bad json'), true],
    ['a grounding failure', new GroundingError('detail', ['CVE-2026-1']), true],
    ['a refusal', new RefusalError('declined'), false],
    ['an unworkable topic', new TopicUnworkableError('no tier 1', 'pick another'), false],
  ])('%s → %s', (_label, error, expected) => {
    expect(error.retryable).toBe(expected);
  });

  it('classifies an unworkable topic under its own kind', () => {
    expect(new TopicUnworkableError('no tier 1', 'pick another').kind).toBe('unworkable');
  });
});

describe('shouldRetry', () => {
  it('retries a transient failure on the first attempt', () => {
    expect(shouldRetry(new ProviderError('tavily 500'), 1)).toBe(true);
  });

  it('stops once the attempt cap is reached', () => {
    expect(shouldRetry(new ProviderError('tavily 500'), MAX_STAGE_ATTEMPTS)).toBe(false);
  });

  it('never retries a terminal failure, even on the first attempt', () => {
    expect(shouldRetry(new TopicUnworkableError('no tier 1', 'pick another'), 1)).toBe(false);
    expect(shouldRetry(new RefusalError('declined'), 1)).toBe(false);
  });

  it('retries an unclassified failure once rather than ending the run', () => {
    expect(shouldRetry(classify(new Error('who knows')), 1)).toBe(true);
  });
});
