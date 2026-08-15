import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ArticleMeta } from '../../core/models/article.model';
import { CATEGORY_LABELS } from '../../core/site.config';

@Component({
  selector: 'app-article-card',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card article-card">
      <div class="meta-line">
        <a class="badge" [routerLink]="['/category', article().category]">
          {{ labels[article().category] }}
        </a>
        <time [attr.datetime]="article().publishedAt">
          {{ article().publishedAt | date: 'mediumDate' }}
        </time>
        <span aria-hidden="true">·</span>
        <span>{{ article().readingTime }} min read</span>
      </div>

      <h2>
        <a [routerLink]="['/article', article().slug]">{{ article().title }}</a>
      </h2>

      <p class="excerpt">{{ article().description }}</p>

      @if (article().cves?.length) {
        <p class="cves">
          @for (cve of article().cves; track cve) {
            <code>{{ cve }}</code>
          }
        </p>
      }
    </article>
  `,
  styles: `
    .article-card {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      height: 100%;
      transition: border-color 0.15s ease;
    }
    .article-card:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }

    h2 {
      font-size: 1.15rem;
      margin: 0;
      a { color: var(--fg); text-decoration: none; }
      a:hover { color: var(--accent); }
    }

    .excerpt {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .cves {
      margin: auto 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding-top: 0.4rem;
    }
    .cves code {
      font-family: var(--font-mono);
      font-size: 0.7rem;
      color: var(--muted);
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.1rem 0.35rem;
    }
  `,
})
export class ArticleCard {
  readonly article = input.required<ArticleMeta>();
  protected readonly labels = CATEGORY_LABELS;
}
