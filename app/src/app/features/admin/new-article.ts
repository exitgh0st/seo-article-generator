import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { SeoService } from '../../core/services/seo.service';
import { ARTICLE_CATEGORIES } from '../../core/models/article.model';
import type { TopicPreflight, TopicSuggestion } from '../../core/models/generation.model';
import { CATEGORY_LABELS, SITE } from '../../core/site.config';

/**
 * Start a run.
 *
 * Three fields, deliberately. The operator is not a security analyst and every
 * extra input is a chance to get something wrong that the pipeline could work
 * out for itself: word count is fixed to the band the rubric wants, the angle is
 * chosen later from real options rather than guessed at up front, and the
 * keyword is optional because the angle supplies a better one.
 *
 * The suggest button fills those fields and stops. It could start the run in one
 * press, and deliberately does not: the operator is the only part of this system
 * that knows which story is worth the money, and a button that both chooses and
 * commits removes the one decision they are here to make.
 *
 * Start checks the topic before it commits to it.
 *
 * A run is six stages and a bill, and the two ways a topic fails most often —
 * nothing published about it, or we wrote it last week — are knowable in about
 * three seconds. So the first press asks the server, and only a `ready` verdict
 * goes straight through to the run. A blocking verdict stops here and offers the
 * suggester, which is the "give me something that works" path. A `thin` verdict
 * prints what is missing and leaves the button live, so a second press means
 * "start anyway" — search ranking is a sample rather than the record, and
 * refusing on it would refuse stories that write perfectly well.
 */
@Component({
  selector: 'app-new-article',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-article.html',
  styleUrl: './admin.scss',
})
export class NewArticle {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);

  protected readonly categories = ARTICLE_CATEGORIES;
  protected readonly labels = CATEGORY_LABELS;

  protected readonly topic = signal('');
  protected readonly primaryKeyword = signal('');
  protected readonly category = signal<string>('vulnerabilities');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly checking = signal(false);
  protected readonly preflight = signal<TopicPreflight | null>(null);
  /**
   * The topic the verdict in `preflight` was about.
   *
   * Kept so an edited topic invalidates the verdict rather than inheriting it.
   * Without this, checking a covered topic, editing it into a good one and
   * pressing Start again would be blocked by a stale answer — and, worse, the
   * reverse: a `ready` verdict would wave through whatever the box now says.
   */
  private readonly checkedTopic = signal('');

  protected readonly suggesting = signal(false);
  protected readonly suggestions = signal<TopicSuggestion[] | null>(null);
  /** Why the list came back empty. Only ever set alongside an empty list. */
  protected readonly suggestNote = signal<string | null>(null);
  /**
   * Which suggestion is in the form right now, derived rather than remembered.
   * A flag set on click keeps claiming "filled in" after the operator edits the
   * topic away from it, which is the one moment the mark is actively wrong.
   */
  protected readonly applied = computed(() => this.topic().trim());

  protected readonly canSubmit = computed(
    () =>
      this.topic().trim().length >= 8 &&
      !this.busy() &&
      !this.suggesting() &&
      !this.checking() &&
      !this.blocked(),
  );

  /** The verdict, but only while it is still about what is in the box. */
  protected readonly verdict = computed(() =>
    this.checkedTopic() === this.topic().trim() ? this.preflight() : null,
  );

  /** A verdict the operator may not overrule: nothing found, or already written. */
  protected readonly blocked = computed(() => this.verdict()?.blocking === true);

  /**
   * Whether the next press starts the run rather than checking first. True once a
   * non-blocking verdict is on screen for this exact topic, which is what makes
   * "Start anyway" a second press rather than a second button.
   */
  protected readonly checked = computed(() => this.verdict() !== null && !this.blocked());

  protected readonly submitLabel = computed(() => {
    if (this.busy()) return 'Starting…';
    if (this.checking()) return 'Checking the topic…';
    if (this.checked()) return 'Start anyway';
    return 'Start writing';
  });

  protected readonly verdictClass = computed(() => {
    const v = this.verdict();
    if (!v) return '';
    if (v.blocking) return 'verdict--stop';
    return v.verdict === 'ready' ? 'verdict--ready' : 'verdict--warn';
  });

  protected readonly verdictHeadline = computed(() => {
    const v = this.verdict();
    switch (v?.verdict) {
      case 'covered':
        // Two different findings share this verdict. A CVE already on an article
        // is the same vulnerability and blocks; a shared primary keyword is only
        // the same product, which is very often a new story.
        return v.blocking ? 'You have already written this' : 'You have covered this before';
      case 'unsourceable':
        return 'Nothing to write from';
      case 'thin':
        return 'Thinly sourced so far';
      default:
        return 'Good to write';
    }
  });

  /**
   * The search runs across every beat, not the one in the category select.
   *
   * The select is where the article will be filed, which is a decision about a
   * story the operator has not chosen yet. Narrowing the search by it would hide
   * the week's biggest story behind a dropdown nobody thought to change.
   */
  protected suggest(): void {
    if (this.suggesting() || this.busy()) return;

    this.suggesting.set(true);
    this.error.set(null);
    this.suggestions.set(null);
    this.suggestNote.set(null);

    this.api.suggestTopics().subscribe({
      next: (res) => {
        this.suggesting.set(false);
        this.suggestions.set(res.suggestions);
        this.suggestNote.set(res.suggestions.length ? null : (res.note ?? null));
      },
      error: (err) => {
        this.suggesting.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  /** Fills the form. Starting is still the operator's press. */
  protected apply(suggestion: TopicSuggestion): void {
    this.topic.set(suggestion.topic);
    this.category.set(suggestion.category);
    this.primaryKeyword.set(suggestion.primaryKeyword);
  }

  /**
   * One button, two jobs, in the order that spends the least.
   *
   * First press checks. If the answer is `ready` the run starts in the same press,
   * so the healthy case is still one click. Anything else stops and shows why, and
   * for a non-blocking verdict the next press goes ahead.
   */
  protected start(): void {
    if (!this.canSubmit()) return;
    if (this.checked()) {
      this.begin();
      return;
    }

    this.checking.set(true);
    this.error.set(null);
    this.preflight.set(null);

    const topic = this.topic().trim();

    this.api.preflightTopic(topic, this.category()).subscribe({
      next: (report) => {
        this.checking.set(false);
        this.checkedTopic.set(topic);
        this.preflight.set(report);
        // Nothing to tell the operator, so do not make them press again for it.
        if (report.verdict === 'ready') this.begin();
      },
      error: (err) => {
        this.checking.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  private begin(): void {
    this.busy.set(true);
    this.error.set(null);

    this.api
      .startRun({
        topic: this.topic().trim(),
        primaryKeyword: this.primaryKeyword().trim() || undefined,
        category: this.category(),
      })
      .subscribe({
        // Navigate straight to the timeline. The run is not awaited — research
        // takes the better part of a minute and the operator should be watching
        // it rather than a spinner on a form.
        next: (run) => void this.router.navigate(['/admin/runs', run.id]),
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err));
        },
      });
  }

  constructor() {
    inject(SeoService).setPage({
      title: `New article — ${SITE.name}`,
      description: 'Start an article.',
      path: '/admin/new',
      noIndex: true,
    });
  }
}
