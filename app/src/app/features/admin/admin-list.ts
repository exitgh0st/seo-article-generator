import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { AuthService } from '../../core/services/auth.service';
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
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly categories = ARTICLE_CATEGORIES;
  protected readonly statuses = ARTICLE_STATUSES;
  protected readonly labels = CATEGORY_LABELS;

  protected readonly all = toSignal(this.content.all$, { initialValue: [] as ArticleMeta[] });
  protected readonly stats = toSignal(this.content.stats(), { initialValue: null });

  protected readonly query = signal('');
  protected readonly status = signal<string>('');
  protected readonly category = signal<string>('');
  protected readonly sort = signal<SortKey>('publishedAt');

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

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  constructor() {
    inject(SeoService).setPage({
      title: `Admin — ${SITE.name}`,
      description: 'Article management dashboard.',
      path: '/admin',
      noIndex: true,
    });
  }
}
