import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { ARTICLE_CATEGORIES, ARTICLE_STATUSES, ArticleMeta } from '../../core/models/article.model';
import { CATEGORY_LABELS, SITE } from '../../core/site.config';

type SortKey = 'publishedAt' | 'title' | 'seoScore' | 'wordCount';

@Component({
  selector: 'app-admin-list',
  imports: [RouterLink, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-list.html',
  styleUrl: './admin.scss',
})
export class AdminList {
  private readonly content = inject(ContentService);
  private readonly api = inject(AdminApiService);

  protected readonly categories = ARTICLE_CATEGORIES;
  protected readonly statuses = ARTICLE_STATUSES;
  protected readonly labels = CATEGORY_LABELS;

  protected readonly all = toSignal(this.content.all$, { initialValue: [] as ArticleMeta[] });
  protected readonly stats = toSignal(this.content.stats(), { initialValue: null });

  protected readonly query = signal('');
  protected readonly status = signal<string>('');
  protected readonly category = signal<string>('');
  protected readonly sort = signal<SortKey>('publishedAt');

  /** Slug whose Delete has been pressed once. Only ever one row at a time. */
  protected readonly confirming = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const status = this.status();
    const category = this.category();
    const sort = this.sort();

    return this.all()
      .filter((a) => !status || a.status === status)
      .filter((a) => !category || a.category === category)
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.slug.includes(q) ||
          a.primaryKeyword.toLowerCase().includes(q) ||
          a.tags.some((t) => t.includes(q)) ||
          (a.cves ?? []).some((c) => c.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (sort === 'seoScore') return b.seoScore - a.seoScore;
        if (sort === 'wordCount') return b.wordCount - a.wordCount;
        return b.publishedAt.localeCompare(a.publishedAt);
      });
  });

  protected scoreClass(a: ArticleMeta): string {
    if (a.seoBlocking.length) return 'badge--danger';
    if (a.seoScore >= 12) return 'badge--ok';
    return 'badge--warn';
  }

  protected statusClass(status: string): string {
    return status === 'published' ? 'badge--ok' : status === 'review' ? 'badge--warn' : 'badge--muted';
  }

  protected reset(): void {
    this.query.set('');
    this.status.set('');
    this.category.set('');
  }

  /**
   * Arms the row. Pressing Delete on a different row moves the arming rather
   * than deleting anything, so there is never more than one loaded button on
   * screen and a double-click on the wrong row cannot reach the second step.
   */
  protected askDelete(slug: string): void {
    this.error.set(null);
    this.confirming.set(slug);
  }

  protected confirmDelete(slug: string): void {
    if (this.deleting()) return;

    this.deleting.set(slug);
    this.error.set(null);

    this.api.deleteArticle(slug).subscribe({
      next: () => {
        this.deleting.set(null);
        this.confirming.set(null);
        // Drops every cache, so the table and the counters above it both
        // re-read rather than being patched locally and drifting.
        this.content.refresh();
      },
      error: (err) => {
        this.deleting.set(null);
        this.confirming.set(null);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  constructor() {
    inject(SeoService).setPage({
      title: `Dashboard — ${SITE.name}`,
      description: 'Article management dashboard.',
      path: '/admin',
      noIndex: true,
    });
  }
}
