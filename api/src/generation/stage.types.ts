import type { GenerationRun } from '@prisma/client';
import type { Usage } from './deepseek.service';

/**
 * The six stages, in order. The array is the ordering — `ordinal` is its index,
 * so adding a stage means inserting here and nowhere else.
 */
export const STAGE_NAMES = [
  'research',
  'angle',
  'draft',
  'humanize',
  'audit',
  'review',
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

/** What the operator sees. Deliberately free of jargon. */
export const STAGE_LABELS: Record<StageName, string> = {
  research: 'Finding and reading sources',
  angle: 'Choosing the angle',
  draft: 'Writing the article',
  humanize: 'Editing so it does not read as AI',
  audit: 'Checking against the SEO and editorial rules',
  review: 'Ready for your review',
};

export interface StageResult {
  /** Persisted on the stage row, and available to later stages. */
  output?: unknown;
  usage?: Usage;
  /**
   * Set by `angle` to park the run until a person chooses. The worker will not
   * pick the run up again until `chooseAngle` clears it.
   */
  awaitingInput?: boolean;
  /**
   * Patched onto the run row — brief slug, article slug, offered angles.
   *
   * Declared narrowly rather than as `Partial<GenerationRun>`: Prisma's JSON
   * columns read back as `JsonValue | null` but only accept `InputJsonValue` on
   * write, so the row type is not assignable to its own update input.
   */
  runPatch?: {
    briefSlug?: string;
    articleSlug?: string;
    angleOptions?: unknown;
    /** Set by `angle` when the run is choosing for itself. */
    chosenAngle?: unknown;
  };
}

export interface StageContext {
  run: GenerationRun;
  /** Output of an earlier stage, by name. Undefined if it has not run. */
  outputOf(name: StageName): unknown;
}

export interface Stage {
  readonly name: StageName;
  run(ctx: StageContext): Promise<StageResult>;
}
