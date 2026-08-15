import { Injectable } from '@nestjs/common';
import { StageError } from '../errors';
import { HumanizeService } from '../humanize.service';
import type { Stage, StageContext, StageResult } from '../stage.types';

/**
 * The pipeline's wrapper around HumanizeService.
 *
 * The work itself — the rewrite, the deterministic repairs, and the grounding
 * check that proves no fact moved — lives in the service, because
 * `npm run humanize` backfills existing articles through exactly the same path.
 * A backfilled article and a freshly generated one must be treated identically.
 */
@Injectable()
export class HumanizeStage implements Stage {
  readonly name = 'humanize' as const;

  constructor(private readonly humanizer: HumanizeService) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const slug = ctx.run.articleSlug;
    if (!slug) {
      throw new StageError(
        'No article on the run.',
        'validation',
        'The writing step did not finish. Retry from there.',
      );
    }

    const result = await this.humanizer.humanize(slug);

    return {
      output: {
        charsBefore: result.charsBefore,
        charsAfter: result.charsAfter,
        emDashesRemoved: result.emDashesRemoved,
        emDashesRemaining: result.emDashesRemaining,
        score: result.score,
        groundingChecked: result.groundingChecked,
      },
      usage: result.usage,
    };
  }
}
