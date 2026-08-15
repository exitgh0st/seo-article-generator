import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, shareReplay, map, switchMap } from 'rxjs';
import { ContentSource } from './content-source';
import { Article, ArticleCategory, ArticleMeta, ArticleStatus } from '../models/article.model';

/**
 * Reads articles from the API.
 *
 * This was a read-only view over build-time JSON. Articles now live in Postgres
 * and imports write to them while the app is running, so the caches here need
 * to be droppable — `refresh()` after any mutation, or the admin list will keep
 * showing a draft that has since been published.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly source = inject(ContentSource);

  /** Bumped by refresh() to invalidate every cached stream below. */
  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private articleCache = new Map<string, Observable<Article | null>>();

  /** Every article the caller is allowed to see. Admin surfaces use this. */
  readonly all$: Observable<ArticleMeta[]> = this.reload$.pipe(
    switchMap(() => this.source.index()),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /**
   * Published articles only, newest first.
   *
   * The API already filters these out for anonymous callers; this second filter
   * matters for the operator, whose token widens `all$` to include drafts.
   */
  readonly published$: Observable<ArticleMeta[]> = this.all$.pipe(
    map((articles) => articles.filter((a) => a.status === 'published')),
  );

  article(slug: string): Observable<Article | null> {
    let cached = this.articleCache.get(slug);
    if (!cached) {
      cached = this.source
        .article(slug)
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.articleCache.set(slug, cached);
    }
    return cached;
  }

  /** Drops every cache. Call after publishing, saving, or deleting. */
  refresh(): void {
    this.articleCache = new Map();
    this.reload$.next();
  }

  byCategory(category: ArticleCategory): Observable<ArticleMeta[]> {
    return this.published$.pipe(map((a) => a.filter((x) => x.category === category)));
  }

  byTag(tag: string): Observable<ArticleMeta[]> {
    return this.published$.pipe(map((a) => a.filter((x) => x.tags.includes(tag))));
  }

  /** Same category first, then shared tags. Excludes the article itself. */
  related(slug: string, limit = 3): Observable<ArticleMeta[]> {
    return this.published$.pipe(
      map((articles) => {
        const current = articles.find((a) => a.slug === slug);
        if (!current) return [];
        return articles
          .filter((a) => a.slug !== slug)
          .map((a) => ({
            article: a,
            score:
              (a.category === current.category ? 2 : 0) +
              a.tags.filter((t) => current.tags.includes(t)).length,
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((x) => x.article);
      }),
    );
  }

  stats(): Observable<ContentStats> {
    return this.all$.pipe(
      map((articles) => {
        const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
        const scored = articles.filter((a) => a.seoMax > 0);
        return {
          total: articles.length,
          byStatus: articles.reduce(
            (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
            {} as Partial<Record<ArticleStatus, number>>,
          ),
          thisWeek: articles.filter((a) => a.publishedAt >= weekAgo).length,
          averageScore: scored.length
            ? Math.round((scored.reduce((s, a) => s + a.seoScore, 0) / scored.length) * 10) / 10
            : 0,
          blocked: articles.filter((a) => a.seoBlocking.length > 0).length,
        };
      }),
    );
  }
}

export interface ContentStats {
  total: number;
  /** Statuses with no articles are absent, not zero. */
  byStatus: Partial<Record<ArticleStatus, number>>;
  thisWeek: number;
  averageScore: number;
  blocked: number;
}
