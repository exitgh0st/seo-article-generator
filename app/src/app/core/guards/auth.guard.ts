import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guards the admin surfaces. These are RenderMode.Client, so this only ever runs
 * in the browser where the token is readable.
 *
 * This is a routing convenience, not the security boundary — the API enforces
 * authorization on every request regardless of what the client renders.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { redirectTo: state.url },
  });
};
