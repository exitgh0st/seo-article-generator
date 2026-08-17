import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { SITE } from '../../core/site.config';
import {
  isActive,
  type GenerationRun,
  type GenerationStage,
} from '../../core/models/generation.model';

const POLL_MS = 3_000;

/**
 * The run timeline.
 *
 * Polls rather than streams: the server has no open connection to hold, a
 * dropped socket would need reconnect logic, and three seconds is well inside
 * what a stage takes. **The poll stops the moment the run reaches a state that
 * will not change on its own** — a browser left open on a finished run should
 * not keep asking.
 */
@Component({
  selector: 'app-run-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-detail.html',
  styleUrl: './admin.scss',
})
export class RunDetail implements OnInit, OnDestroy {
  private readonly api = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(ContentService);

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly run = signal<GenerationRun | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly active = computed(() => {
    const run = this.run();
    return run ? isActive(run) : false;
  });

  protected readonly awaitingAngle = computed(
    () => this.run()?.status === 'awaiting_input',
  );

  protected readonly failedStage = computed(
    () => this.run()?.stages.find((s) => s.status === 'failed') ?? null,
  );

  protected readonly finished = computed(() => this.run()?.status === 'succeeded');

  /**
   * The run died on the topic rather than on anything about this attempt.
   *
   * Worth its own state because the answer is a different topic, not a button. A
   * retry here searches the same web and finds the same nothing, and offering it
   * is how an operator ends up pressing a button four times before giving up.
   */
  protected readonly unworkable = computed(
    () => this.failedStage()?.errorKind === 'unworkable',
  );

  /** The angle the run took for itself, and what it passed over to take it. */
  protected readonly autoAngle = computed(() => {
    const run = this.run();
    if (!run?.autoAngle || !run.chosenAngle) return null;
    return {
      chosen: run.chosenAngle,
      alternatives: (run.angleOptions ?? []).filter(
        (a) => a.title !== run.chosenAngle?.title,
      ),
    };
  });

  ngOnInit(): void {
    this.load();
    this.timer = setInterval(() => {
      // Only while there is something to see. A run waiting on the operator or
      // one that has finished will not change until they act.
      const run = this.run();
      if (run === null || isActive(run)) this.load();
    }, POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private load(): void {
    this.api.run(this.id).subscribe({
      next: (run) => {
        this.run.set(run);
        // A finished run has written an article; drop the cached list so the
        // admin table shows it.
        if (run.status === 'succeeded') this.content.refresh();
      },
      error: (err) => this.error.set(apiErrorMessage(err)),
    });
  }

  protected chooseAngle(index: number): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.chooseAngle(this.id, index).subscribe({
      next: (run) => {
        this.run.set(run);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected retry(stage: GenerationStage): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.retryStage(this.id, stage.name).subscribe({
      next: (run) => {
        this.run.set(run);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  /** Drives the dot colour. Kept out of the template so it reads as one thing. */
  protected stageClass(stage: GenerationStage): string {
    switch (stage.status) {
      case 'succeeded':
        return 'stage--done';
      case 'failed':
        return 'stage--failed';
      case 'running':
        return 'stage--running';
      case 'awaiting_input':
        return 'stage--waiting';
      default:
        return 'stage--pending';
    }
  }

  protected stageNote(stage: GenerationStage): string {
    if (stage.status === 'running') return 'working…';
    if (stage.status === 'awaiting_input') return 'waiting for you';
    if (stage.status === 'pending') return 'not started';
    if (stage.status === 'succeeded') {
      return stage.attempt > 1 ? `done (attempt ${stage.attempt})` : 'done';
    }
    return '';
  }

  constructor() {
    inject(SeoService).setPage({
      title: `Writing an article — ${SITE.name}`,
      description: 'Article generation progress.',
      path: '/admin/runs',
      noIndex: true,
    });
  }
}
