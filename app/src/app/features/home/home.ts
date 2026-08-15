import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { SITE } from '../../core/site.config';
import { ArticleCard } from '../../shared/article-card/article-card';

@Component({
  selector: 'app-home',
  imports: [ArticleCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <header class="page-head">
        <h1>{{ site.name }}</h1>
        <p>{{ site.description }}</p>
      </header>

      @if (articles(); as list) {
        @if (list.length) {
          <div class="grid">
            @for (article of list; track article.slug) {
              <app-article-card [article]="article" />
            }
          </div>
        } @else {
          <div class="empty">
            <p><strong>No published articles yet.</strong></p>
            <p>
              Run <code>/research &lt;topic&gt;</code> then <code>/write-article</code> in Claude
              Code, audit the draft, and publish it.
            </p>
          </div>
        }
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
export class Home {
  private readonly content = inject(ContentService);
  protected readonly site = SITE;
  protected readonly articles = toSignal(this.content.published$, { initialValue: [] });

  constructor() {
    inject(SeoService).setPage({
      title: `${SITE.name} — ${SITE.tagline}`,
      description: SITE.description,
      path: '/',
    });
  }
}
