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
  error: string | null;
  errorKind: ErrorKind | null;
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
