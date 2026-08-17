import {
  Component,
  inject,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { SeoService } from '../../core/services/seo.service';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { ContentService } from '../../core/services/content.service';
import { Article } from '../../core/models/article.model';
import { CATEGORY_LABELS, SITE } from '../../core/site.config';

/**
 * Read the article, fix small things, go to publish.
 *
 * Editing is three fields on purpose — headline, meta description, body. It
 * covers the realistic case, which is a reviewer spotting an awkward headline or
 * a typo, without becoming a second way to construct an article that could drift
 * from what the pipeline produces.
 *
 * Saving goes through `PATCH /api/articles/:slug`, which re-validates, re-scores
 * and re-runs the editorial scan, so the rubric panel on this page updates from
 * the server rather than from anything guessed here.
 */
@Component({
  selector: 'app-admin-detail',
  imports: [RouterLink, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-detail.html',
  styleUrl: './admin.scss',
})
export class AdminDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly api = inject(AdminApiService);
  private readonly content = inject(ContentService);

  protected readonly labels = CATEGORY_LABELS;

  protected readonly article = signal<Article | null>(
    (this.route.snapshot.data['article'] ?? null) as Article | null,
  );

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  /** Second press of the two-step delete, matching the list screen. */
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);

  protected readonly headline = signal('');
  protected readonly description = signal('');
  protected readonly bodyText = signal('');

  /** Enables Save. Comparing against the loaded article, not a flag. */
  protected readonly dirty = computed(() => {
    const a = this.article();
    if (!a) return false;
    return (
      this.headline() !== (a.headline ?? a.title) ||
      this.description() !== a.description ||
      this.bodyText() !== (a.body ?? '')
    );
  });

  protected readonly descriptionClass = computed(() => {
    const n = this.description().length;
    if (n > 160 || (n > 0 && n < 150)) return 'counter counter--over';
    if (n > 145) return 'counter counter--warn';
    return 'counter';
  });

  protected readonly body = computed(() => {
    const html = this.article()?.html;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  protected readonly passed = computed(
    () => this.article()?.seoBreakdown.filter((r) => r.status === 'pass').length ?? 0,
  );

  protected rowIcon(status: string): string {
    return status === 'pass' ? '✓' : status === 'warn' ? '!' : '✕';
  }

  protected startEditing(): void {
    const a = this.article();
    if (!a) return;

    // The resolver's article has no `body` — the public read returns rendered
    // html only — so the markdown is fetched before the editor opens.
    this.busy.set(true);
    this.api.article(a.slug).subscribe({
      next: (full) => {
        this.article.set(full);
        this.headline.set(full.headline ?? full.title);
        this.description.set(full.description);
        this.bodyText.set(full.body ?? '');
        this.editing.set(true);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected cancel(): void {
    this.editing.set(false);
    this.error.set(null);
  }

  protected save(): void {
    const a = this.article();
    if (!a || !this.dirty() || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);

    this.api
      .patchArticle(a.slug, {
        headline: this.headline(),
        description: this.description(),
        body: this.bodyText(),
      })
      .subscribe({
        next: () => {
          // Re-read so the rubric panel reflects the server's new score rather
          // than the one this page was loaded with.
          this.api.article(a.slug).subscribe({
            next: (full) => {
              this.article.set(full);
              this.bodyText.set(full.body ?? '');
              this.headline.set(full.headline ?? full.title);
              this.description.set(full.description);
              this.busy.set(false);
              this.saved.set(true);
              this.content.refresh();
            },
            error: (err) => {
              this.busy.set(false);
              this.error.set(apiErrorMessage(err));
            },
          });
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err));
        },
      });
  }

  protected confirmDelete(): void {
    const a = this.article();
    if (!a || this.deleting()) return;

    this.deleting.set(true);
    this.error.set(null);

    this.api.deleteArticle(a.slug).subscribe({
      // Back to the list rather than staying on a page whose article no longer
      // exists — the resolver would 404 on the next reload anyway.
      next: () => {
        this.content.refresh();
        void this.router.navigate(['/admin']);
      },
      error: (err) => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  constructor() {
    const a = this.route.snapshot.data['article'] as Article | null;
    inject(SeoService).setPage({
      title: `${a?.title ?? 'Article'} — Admin`,
      description: 'Article detail.',
      path: `/admin/${a?.slug ?? ''}`,
      noIndex: true,
    });
  }
}
