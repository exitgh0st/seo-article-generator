import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STAGE_NAMES, STAGE_LABELS, type Stage, type StageName } from './stage.types';
import { classify, shouldRetry } from './errors';
import { ResearchStage } from './stages/research.stage';
import { AngleStage } from './stages/angle.stage';
import { DraftStage } from './stages/draft.stage';
import { HumanizeStage } from './stages/humanize.stage';
import { AuditStage } from './stages/audit.stage';
import { ReviewStage } from './stages/review.stage';

/**
 * The pipeline's state machine. The database is the queue.
 *
 * Every stage row is created up front so the timeline is fully drawn before any
 * work starts — an operator watching rows appear one at a time cannot tell
 * progress from a hang.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly stages: Record<StageName, Stage>;

  constructor(
    private readonly prisma: PrismaService,
    research: ResearchStage,
    angle: AngleStage,
    draft: DraftStage,
    humanize: HumanizeStage,
    audit: AuditStage,
    review: ReviewStage,
  ) {
    this.stages = { research, angle, draft, humanize, audit, review };
  }

  async createRun(input: {
    topic: string;
    primaryKeyword?: string;
    category: string;
  }) {
    return this.prisma.generationRun.create({
      data: {
        topic: input.topic.trim(),
        primaryKeyword: input.primaryKeyword?.trim() || null,
        category: input.category,
        status: 'pending',
        stages: {
          create: STAGE_NAMES.map((name, ordinal) => ({ name, ordinal })),
        },
      },
      include: { stages: { orderBy: { ordinal: 'asc' } } },
    });
  }

  async getRun(id: string) {
    const run = await this.prisma.generationRun.findUnique({
      where: { id },
      include: { stages: { orderBy: { ordinal: 'asc' } } },
    });
    if (!run) throw new NotFoundException(`No run "${id}"`);
    return {
      ...run,
      stages: run.stages.map((s) => ({
        ...s,
        label: STAGE_LABELS[s.name as StageName] ?? s.name,
      })),
    };
  }

  async listRuns(limit = 20) {
    return this.prisma.generationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        currentStage: true,
        topic: true,
        articleSlug: true,
        createdAt: true,
        finishedAt: true,
      },
    });
  }

  /** Releases the pause left by the angle stage. */
  async chooseAngle(id: string, angleIndex: number) {
    const run = await this.prisma.generationRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`No run "${id}"`);

    const options = (run.angleOptions ?? []) as {
      title: string;
      summary: string;
      primaryKeyword: string;
    }[];

    const chosen = options[angleIndex];
    if (!chosen) {
      throw new BadRequestException(
        `Angle ${angleIndex} is not one of the ${options.length} offered.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.generationStage.updateMany({
        where: { runId: id, name: 'angle' },
        data: { status: 'succeeded', finishedAt: new Date() },
      }),
      this.prisma.generationRun.update({
        where: { id },
        data: { chosenAngle: chosen, status: 'pending' },
      }),
    ]);

    return this.getRun(id);
  }

  /**
   * Re-queue a stage and everything after it.
   *
   * Downstream stages are reset because they consumed the old output — a redraft
   * with the previous audit's fixes still applied is silently stale.
   */
  async retryFrom(id: string, name: string) {
    const stage = await this.prisma.generationStage.findFirst({
      where: { runId: id, name },
    });
    if (!stage) throw new NotFoundException(`Run "${id}" has no stage "${name}"`);

    await this.prisma.$transaction([
      this.prisma.generationStage.updateMany({
        where: { runId: id, ordinal: { gte: stage.ordinal } },
        data: {
          status: 'pending',
          error: null,
          errorKind: null,
          errorDetail: null,
          // `undefined` here meant "leave this field alone" to Prisma, not "clear
          // it", so a re-queued stage kept the output of its previous run — which
          // `advanceOne` then hands to later stages through `outputOf`. The whole
          // point of resetting downstream stages is that their old output is
          // stale.
          output: Prisma.DbNull,
          startedAt: null,
          finishedAt: null,
        },
      }),
      this.prisma.generationRun.update({
        where: { id },
        data: { status: 'pending', error: null, finishedAt: null },
      }),
    ]);

    return this.getRun(id);
  }

  /**
   * Advance one run by one stage.
   *
   * One stage per call, round-robin across runs, so a slow research fetch on one
   * topic does not starve another. A stage failure is recorded and swallowed —
   * rethrowing would take the worker loop down along with every other run.
   *
   * @returns true when work was done, so the caller can tighten its poll.
   */
  async advanceOne(): Promise<boolean> {
    const run = await this.prisma.generationRun.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { stages: { orderBy: { ordinal: 'asc' } } },
    });
    if (!run) return false;

    const next = run.stages.find((s) => s.status === 'pending');
    if (!next) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: { status: 'succeeded', finishedAt: new Date(), currentStage: null },
      });
      return true;
    }

    const stage = this.stages[next.name as StageName];
    if (!stage) {
      await this.failStage(next.id, run.id, `Unknown stage "${next.name}"`, 'unknown');
      return true;
    }

    await this.prisma.$transaction([
      this.prisma.generationStage.update({
        where: { id: next.id },
        data: {
          status: 'running',
          attempt: { increment: 1 },
          startedAt: new Date(),
          error: null,
          errorKind: null,
        },
      }),
      this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'running',
          currentStage: next.name,
          startedAt: run.startedAt ?? new Date(),
        },
      }),
    ]);

    try {
      const outputs = new Map(
        run.stages.filter((s) => s.output != null).map((s) => [s.name, s.output]),
      );

      const result = await stage.run({
        run,
        outputOf: (name) => outputs.get(name),
      });

      await this.prisma.$transaction([
        this.prisma.generationStage.update({
          where: { id: next.id },
          data: {
            status: result.awaitingInput ? 'awaiting_input' : 'succeeded',
            output: (result.output ?? undefined) as never,
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            finishedAt: result.awaitingInput ? null : new Date(),
          },
        }),
        this.prisma.generationRun.update({
          where: { id: run.id },
          data: {
            ...(result.runPatch as Record<string, never> | undefined),
            status: result.awaitingInput ? 'awaiting_input' : 'pending',
            inputTokens: { increment: result.usage?.inputTokens ?? 0 },
            outputTokens: { increment: result.usage?.outputTokens ?? 0 },
          },
        }),
      ]);

      this.logger.log(
        `run ${run.id.slice(0, 8)} ${next.name} -> ${result.awaitingInput ? 'awaiting input' : 'ok'}`,
      );
    } catch (error) {
      const classified = classify(error);

      // Absorb one blip without a person watching.
      //
      // A run is meant to go from a topic to a reviewable draft unattended, and
      // a single Tavily 500 or DeepSeek timeout used to end one that the next
      // attempt would have completed — the operator came back to a stopped run
      // and a button whose only job was to press itself. Re-queueing costs one
      // more stage; stopping costs the whole run and the operator's attention.
      //
      // Only for failures where the identical input could plausibly succeed, and
      // only up to MAX_STAGE_ATTEMPTS. `attempt` was already incremented above,
      // and every stage is idempotent — they replace their own rows rather than
      // appending — which is what makes running one twice safe.
      if (shouldRetry(classified, next.attempt + 1)) {
        await this.prisma.$transaction([
          this.prisma.generationStage.update({
            where: { id: next.id },
            data: { status: 'pending', startedAt: null },
          }),
          this.prisma.generationRun.update({
            where: { id: run.id },
            data: { status: 'pending', currentStage: null },
          }),
        ]);
        this.logger.warn(
          `run ${run.id.slice(0, 8)} ${next.name} failed (${classified.kind}) on ` +
            `attempt ${next.attempt + 1}, retrying: ${classified.message}`,
        );
        return true;
      }

      await this.failStage(
        next.id,
        run.id,
        classified.remedy ?? classified.message,
        classified.kind,
        classified.message,
      );
      this.logger.warn(
        `run ${run.id.slice(0, 8)} ${next.name} failed (${classified.kind}): ${classified.message}`,
      );
    }

    return true;
  }

  /**
   * Reset stages left `running` by a crash.
   *
   * Every stage is idempotent — they replace their own rows rather than
   * appending — so re-running one that may have half-completed is safe.
   */
  async recoverStuckStages(): Promise<number> {
    const stuck = await this.prisma.generationStage.findMany({
      where: { status: 'running' },
      select: { id: true, runId: true, name: true },
    });
    if (!stuck.length) return 0;

    await this.prisma.$transaction([
      this.prisma.generationStage.updateMany({
        where: { id: { in: stuck.map((s) => s.id) } },
        data: { status: 'pending', startedAt: null },
      }),
      this.prisma.generationRun.updateMany({
        where: { id: { in: [...new Set(stuck.map((s) => s.runId))] } },
        data: { status: 'pending', currentStage: null },
      }),
    ]);

    this.logger.warn(
      `Recovered ${stuck.length} stage(s) left running by a restart: ${stuck.map((s) => s.name).join(', ')}`,
    );
    return stuck.length;
  }

  /**
   * Record a stage failure.
   *
   * `message` is the remedy — plain language, aimed at the operator. `detail` is
   * the underlying failure verbatim, kept because the remedy stops being useful
   * the moment it has been followed and the stage failed anyway. It is stored on
   * the stage only; the run's `error` stays the sentence worth reading first.
   */
  private async failStage(
    stageId: string,
    runId: string,
    message: string,
    kind: string,
    detail?: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.generationStage.update({
        where: { id: stageId },
        data: {
          status: 'failed',
          error: message,
          errorKind: kind,
          errorDetail: detail === message ? null : (detail ?? null),
          finishedAt: new Date(),
        },
      }),
      this.prisma.generationRun.update({
        where: { id: runId },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      }),
    ]);
  }
}
