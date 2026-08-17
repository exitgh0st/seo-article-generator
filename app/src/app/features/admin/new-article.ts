import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { SeoService } from '../../core/services/seo.service';
import { ARTICLE_CATEGORIES } from '../../core/models/article.model';
import type { TopicSuggestion } from '../../core/models/generation.model';
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
    () => this.topic().trim().length >= 8 && !this.busy() && !this.suggesting(),
  );

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

  protected start(): void {
    if (!this.canSubmit()) return;

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
