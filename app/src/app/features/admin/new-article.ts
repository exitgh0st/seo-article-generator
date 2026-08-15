import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { SeoService } from '../../core/services/seo.service';
import { ARTICLE_CATEGORIES } from '../../core/models/article.model';
import { CATEGORY_LABELS, SITE } from '../../core/site.config';

/**
 * Start a run.
 *
 * Three fields, deliberately. The operator is not a security analyst and every
 * extra input is a chance to get something wrong that the pipeline could work
 * out for itself: word count is fixed to the band the rubric wants, the angle is
 * chosen later from real options rather than guessed at up front, and the
 * keyword is optional because the angle supplies a better one.
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

  protected readonly canSubmit = computed(
    () => this.topic().trim().length >= 8 && !this.busy(),
  );

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
