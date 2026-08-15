import { Component, inject, computed, ChangeDetectionStrategy, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { ArticleCategory } from '../../core/models/article.model';
import { CATEGORY_LABELS, SITE } from '../../core/site.config';
import { ArticleCard } from '../../shared/article-card/article-card';

/** Serves both /category/:category and /tag/:tag — the route's `data.mode` picks. */
@Component({
  selector: 'app-listing',
  imports: [ArticleCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <header class="page-head">
        <h1>{{ heading() }}</h1>
        <p>{{ articles().length }} published article{{ articles().length === 1 ? '' : 's' }}</p>
      </header>

      @if (articles().length) {
        <div class="grid">
          @for (article of articles(); track article.slug) {
            <app-article-card [article]="article" />
          }
        </div>
      } @else {
        <div class="empty">Nothing published here yet.</div>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
      gap: 1.25rem;
    }
  `,
})
export class Listing {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);

  private readonly mode = this.route.snapshot.data['mode'] as 'category' | 'tag';
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly all = toSignal(this.content.published$, { initialValue: [] });

  protected readonly value = computed(() => this.params().get(this.mode) ?? '');

  protected readonly heading = computed(() =>
    this.mode === 'category'
      ? (CATEGORY_LABELS[this.value()] ?? this.value())
      : `#${this.value()}`,
  );

  protected readonly articles = computed(() => {
    const v = this.value();
    return this.mode === 'category'
      ? this.all().filter((a) => a.category === (v as ArticleCategory))
      : this.all().filter((a) => a.tags.includes(v));
  });

  constructor() {
    effect(() => {
      const label = this.heading();
      this.seo.setPage({
        title: `${label} — ${SITE.name}`,
        description:
          this.mode === 'category'
            ? `${label} news and analysis. ${SITE.description}`
            : `Articles tagged ${this.value()}. ${SITE.description}`,
        path: `/${this.mode}/${this.value()}`,
      });
    });
  }
}
