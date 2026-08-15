import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { of, catchError, tap } from 'rxjs';
import { ContentService } from '../services/content.service';
import { Article } from '../models/article.model';

/**
 * Resolves the article before the route activates, so the page never flashes an
 * empty shell and SeoService has the article to describe by the time the
 * component renders.
 */
export const articleResolver: ResolveFn<Article | null> = (route) => {
  const content = inject(ContentService);
  const router = inject(Router);
  const slug = route.paramMap.get('slug');

  if (!slug) {
    router.navigate(['/not-found'], { skipLocationChange: true });
    return of(null);
  }

  return content.article(slug).pipe(
    tap((article) => {
      // Render the not-found page rather than an empty article shell. The
      // response is still HTTP 200 — a static host answers every path with the
      // app shell, and client-side routing cannot set a status code.
      if (!article) router.navigate(['/not-found'], { skipLocationChange: true });
    }),
    catchError(() => of(null)),
  );
};
