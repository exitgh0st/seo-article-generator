import { inject } from '@angular/core';
import { ResolveFn, Router } from '@angular/router';
import { of, catchError, tap } from 'rxjs';
import { ContentService } from '../services/content.service';
import { Article } from '../models/article.model';

/**
 * Resolves the article before the route activates, so SeoService can write
 * metadata into the server-rendered HTML rather than after hydration.
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
      // Render the not-found page rather than an empty article shell. The HTTP
      // status is corrected to 404 in src/server.ts — routing alone cannot set it.
      if (!article) router.navigate(['/not-found'], { skipLocationChange: true });
    }),
    catchError(() => of(null)),
  );
};
