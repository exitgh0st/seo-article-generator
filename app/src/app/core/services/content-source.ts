import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError } from 'rxjs';
import { Article, ArticleMeta } from '../models/article.model';
import { API_BASE_URL } from '../api.config';

/**
 * Where article JSON comes from.
 *
 * This used to be two implementations: HTTP for the browser, `node:fs` for the
 * server, both reading build-time JSON emitted by scripts/build-content-index.mjs.
 * Articles now live in Postgres and change without a rebuild, so both sides read
 * the same API — the abstraction survives, but only the base URL differs.
 */
@Injectable()
export abstract class ContentSource {
  abstract index(): Observable<ArticleMeta[]>;
  abstract article(slug: string): Observable<Article | null>;
}

@Injectable()
export class ApiContentSource extends ContentSource {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * Published articles for an anonymous caller; everything when the auth
   * interceptor attaches a token. The API decides — the client cannot widen its
   * own view by asking.
   */
  index(): Observable<ArticleMeta[]> {
    return this.http
      .get<ArticleMeta[]>(`${this.base}/api/articles`)
      .pipe(catchError(() => of([])));
  }

  article(slug: string): Observable<Article | null> {
    // Guard the :slug route param before it reaches a URL.
    if (!/^[a-z0-9-]+$/.test(slug)) return of(null);
    return this.http
      .get<Article>(`${this.base}/api/articles/${slug}`)
      .pipe(catchError(() => of(null)));
  }
}
