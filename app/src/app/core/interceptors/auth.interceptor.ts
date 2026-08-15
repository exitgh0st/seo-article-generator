import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { API_BASE_URL } from '../api.config';

/**
 * Attaches the bearer token to API calls and signs out on a 401.
 *
 * Public article reads work without it — the token only widens what the API
 * returns (drafts) and unlocks the write routes.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const base = inject(API_BASE_URL);
  const token = auth.token();

  // Never attach the token to a third-party URL. The API is cross-origin in
  // production, so this has to match the configured base exactly rather than
  // looking for "/api" anywhere in the URL — any host can put that in a path.
  const isApiCall = req.url.startsWith(`${base}/api`);

  const request =
    token && isApiCall
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && token) {
        // The token expired or the secret rotated. Drop it and send the operator
        // back to the login screen rather than leaving the UI half-working.
        auth.logout();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
