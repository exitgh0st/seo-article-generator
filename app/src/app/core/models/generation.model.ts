/**
 * Wire shapes for the generation pipeline.
 *
 * Declared here rather than imported from the API: the two halves ship
 * separately and a shared type would tie the front end's build to the server's
 * source tree. The cost is that a server-side rename has to be mirrored here,
 * which is the trade the rest of the app already makes.
 */

export type StageName =
  | 'research'
  | 'angle'
  | 'draft'
  | 'humanize'
  | 'audit'
  | 'review';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed';

export type StageStatus = RunStatus | 'skipped';

/** Why a stage failed, which decides what the screen offers the operator. */
export type ErrorKind =
  | 'refusal'
  | 'provider'
  | 'validation'
  | 'timeout'
  /**
   * The topic cannot produce an article — nothing was found, or nothing primary.
   * The screen must not offer Retry for this: pressing it searches the same web
   * and finds the same nothing.
   */
  | 'unworkable'
  | 'unknown';

export interface Angle {
  title: string;
  summary: string;
  primaryKeyword: string;
}

export interface GenerationStage {
  id: string;
  name: StageName;
  /** Plain-language label from the server. Never show `name` to the operator. */
  label: string;
  ordinal: number;
  status: StageStatus;
  attempt: number;
  output: unknown;
  /** The remedy, in plain language. This is the line the operator acts on. */
  error: string | null;
  errorKind: ErrorKind | null;
  /**
   * The underlying failure, verbatim. Only worth showing once the remedy has
   * been followed and the step failed anyway, which is why it is behind a
   * disclosure rather than on the page.
   */
  errorDetail: string | null;
  inputTokens: number;
  outputTokens: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface GenerationRun {
  id: string;
  status: RunStatus;
  currentStage: StageName | null;
  topic: string;
  primaryKeyword: string | null;
  category: string;
  chosenAngle: Angle | null;
  angleOptions: Angle[] | null;
  /** False only when the operator asked to pick the angle themselves. */
  autoAngle: boolean;
  briefSlug: string | null;
  articleSlug: string | null;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  stages: GenerationStage[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  currentStage: StageName | null;
  topic: string;
  articleSlug: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface SuggestionSource {
  title: string;
  url: string;
  publisher: string;
  /** 1 = primary/vendor/government, 2 = credible outlet. Tier 3 never appears. */
  tier: 1 | 2 | 3;
}

/** A story the server believes is worth writing and is not covered yet. */
export interface TopicSuggestion {
  topic: string;
  primaryKeyword: string;
  category: string;
  /** One sentence for the operator to read. Never submitted with the run. */
  why: string;
  sources: SuggestionSource[];
  cves: string[];
  hasPrimarySource: boolean;
}

export interface TopicSuggestionsResponse {
  suggestions: TopicSuggestion[];
  consideredCount: number;
  excludedCount: number;
  searchedAt: string;
  /**
   * Present only when `suggestions` is empty. Both a quiet week and an
   * all-covered week are a 200, so this is the only thing that tells them apart
   * — render it rather than showing a bare empty list.
   */
  note?: string;
}

/**
 * Whether a topic can become an article, answered before a run is created.
 *
 * `blocking` is the server's judgement and the screen should respect it: only
 * "nothing found" and "already covered" set it. A `thin` verdict is a warning the
 * operator is allowed to overrule, because search ranking is a sample and the
 * research stage digs harder than this check does.
 *
 * Not to be confused with `PreflightReport` below, which is the *publish* gate.
 */
export type TopicVerdict = 'ready' | 'thin' | 'covered' | 'unsourceable';

export interface TopicPreflight {
  verdict: TopicVerdict;
  blocking: boolean;
  /** One plain-language sentence. The whole verdict, for someone not reading on. */
  summary: string;
  candidateCount: number;
  tier1Count: number;
  distinctPublishers: number;
  cves: string[];
  covered: { slug: string; title: string; status: string; publishedAt: string }[];
  sources: SuggestionSource[];
  searchedAt: string;
}

export interface SourceCheck {
  url: string;
  ok: boolean;
  status: number | null;
  detail?: string;
}

export interface PreflightReport {
  slug: string;
  ok: boolean;
  blockers: string[];
  warnings: string[];
  sourceChecks: SourceCheck[];
}

/** A run is finished when nothing more will happen without a person. */
export function isActive(run: { status: RunStatus }): boolean {
  return run.status === 'pending' || run.status === 'running';
}
