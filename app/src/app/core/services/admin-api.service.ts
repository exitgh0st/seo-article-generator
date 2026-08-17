import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import type {
  GenerationRun,
  PreflightReport,
  RunSummary,
  TopicSuggestionsResponse,
} from '../models/generation.model';
import type { Article } from '../models/article.model';

/**
 * Everything the admin screens write.
 *
 * The app had no write capability at all until now — the only `http.post`
 * anywhere was the login call. `ContentService` stays read-only and cached;
 * anything here that changes an article must be followed by
 * `ContentService.refresh()`, which drops every cache.
 *
 * The auth interceptor attaches the bearer token to `/api` URLs, so nothing here
 * deals with headers.
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  // ---- generation ----

  startRun(input: {
    topic: string;
    primaryKeyword?: string;
    category: string;
  }): Observable<GenerationRun> {
    return this.http.post<GenerationRun>(`${this.base}/api/generation/runs`, input);
  }

  /**
   * Stories worth writing that the library does not already cover. Starts
   * nothing — the operator picks one and then presses Start as usual.
   */
  suggestTopics(category?: string): Observable<TopicSuggestionsResponse> {
    return this.http.post<TopicSuggestionsResponse>(
      `${this.base}/api/generation/suggestions`,
      category ? { category } : {},
    );
  }

  run(id: string): Observable<GenerationRun> {
    return this.http.get<GenerationRun>(`${this.base}/api/generation/runs/${id}`);
  }

  runs(): Observable<RunSummary[]> {
    return this.http.get<RunSummary[]>(`${this.base}/api/generation/runs`);
  }

  chooseAngle(id: string, angleIndex: number): Observable<GenerationRun> {
    return this.http.post<GenerationRun>(
      `${this.base}/api/generation/runs/${id}/angle`,
      { angleIndex },
    );
  }

  /** Re-queues this stage and every stage after it. */
  retryStage(id: string, stage: string): Observable<GenerationRun> {
    return this.http.post<GenerationRun>(
      `${this.base}/api/generation/runs/${id}/stages/${stage}/retry`,
      {},
    );
  }

  // ---- articles ----

  /** Full record including the markdown body, which the public read omits. */
  article(slug: string): Observable<Article> {
    return this.http.get<Article>(`${this.base}/api/articles/${slug}`);
  }

  patchArticle(
    slug: string,
    patch: { headline?: string; description?: string; body?: string },
  ): Observable<unknown> {
    return this.http.patch(`${this.base}/api/articles/${slug}`, patch);
  }

  preflight(slug: string): Observable<PreflightReport> {
    return this.http.get<PreflightReport>(
      `${this.base}/api/articles/${slug}/preflight`,
    );
  }

  publish(slug: string): Observable<unknown> {
    return this.http.post(`${this.base}/api/articles/${slug}/publish`, {});
  }

  /**
   * Removes the article and the markdown the publication exported for it.
   * Irreversible from here — git history is the only copy afterwards.
   */
  deleteArticle(slug: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/articles/${slug}`);
  }

  // ---- system ----

  /**
   * Liveness and database connectivity, for the settings screen. The endpoint is
   * public; the bearer the interceptor attaches is ignored.
   */
  health(): Observable<HealthReport> {
    return this.http.get<HealthReport>(`${this.base}/api/health`);
  }
}

export interface HealthReport {
  status: string;
  /** `up`, or `down: <reason>`. */
  database: string;
  /** Seconds the API process has been running. */
  uptime: number;
  timestamp: string;
}

/**
 * A message worth showing a non-technical operator.
 *
 * The API's exception filter puts a written sentence in `error.message`, and the
 * generation stages put a remedy there deliberately. Angular's own HTTP text
 * ("Http failure response for …: 400 Bad Request") is the last resort, never the
 * first choice.
 */
export function apiErrorMessage(error: unknown): string {
  const body = (error as { error?: { message?: string | string[] } })?.error;
  const message = body?.message;

  if (Array.isArray(message)) return message.join('. ');
  if (typeof message === 'string' && message.trim()) return message;

  const status = (error as { status?: number })?.status;
  if (status === 0) {
    return 'Could not reach the server. Check that it is running, then try again.';
  }
  if (status === 401) return 'Your session expired. Sign in again.';

  return 'Something went wrong. Try again, and if it keeps happening, tell your developer what you were doing.';
}
